import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { qloFetch, buildXml, QloAppsError } from "@/lib/qloapps-client";

export const dynamic = "force-dynamic";

// QloApps payment_status: 1 = completed (paid), 2 = partial, 3 = awaiting.
const PAID_STATUS = "1";

/**
 * POST /api/xendit/webhook
 *
 * Xendit calls this when a QRIS payment succeeds. Set this URL as the webhook
 * in the Xendit dashboard (your Vercel domain, e.g.
 * https://<app>.vercel.app/api/xendit/webhook) and set XENDIT_WEBHOOK_TOKEN.
 *
 * Flow: verify token → confirm payment.succeeded/SUCCEEDED → read booking_id
 * from metadata → mark the QloApps booking paid (idempotent).
 */
export async function POST(req: NextRequest) {
  // 1. Verify the callback token before doing anything else.
  if (!verifyToken(req)) {
    return NextResponse.json({ error: "Invalid callback token" }, { status: 401 });
  }

  let payload: XenditWebhook;
  try {
    payload = (await req.json()) as XenditWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = payload.data;
  const succeeded = payload.event === "payment.succeeded" && data?.status === "SUCCEEDED";
  if (!succeeded) {
    // Acknowledge other events so Xendit doesn't retry them.
    return NextResponse.json({ received: true });
  }

  const bookingId = data?.metadata?.booking_id;
  if (!bookingId) {
    console.warn("[xendit-webhook] payment.succeeded without metadata.booking_id");
    return NextResponse.json({ received: true });
  }

  try {
    // 2. Idempotency — if already paid, acknowledge and stop.
    const current = await qloFetch<{ booking?: { payment_status?: string | number } }>(
      `/api/bookings/${encodeURIComponent(bookingId)}`
    );
    if (String(current.booking?.payment_status) === PAID_STATUS) {
      return NextResponse.json({ received: true, alreadyPaid: true });
    }

    // 3. Mark the booking paid and record the Xendit transaction id.
    const updateXml = buildXml(
      {
        booking: {
          id: bookingId,
          payment_status: PAID_STATUS,
          payment_detail: {
            payment_type: "online",
            payment_method: "QRIS (Xendit)",
            transaction_id: data.id,
          },
        },
      },
      "prestashop"
    );

    await qloFetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
      method: "PUT",
      body: updateXml,
    });

    return NextResponse.json({ received: true, updated: true });
  } catch (err) {
    // Return 500 so Xendit retries; the idempotency check above prevents a
    // double update once it eventually succeeds.
    const message =
      err instanceof QloAppsError ? err.message : err instanceof Error ? err.message : "error";
    console.error("[xendit-webhook] QloApps update failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type XenditWebhook = {
  event?: string;
  data?: {
    id?: string;
    amount?: number;
    status?: string;
    metadata?: { booking_id?: string };
  };
};

function verifyToken(req: NextRequest): boolean {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  const received = req.headers.get("x-callback-token");
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
