import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { qloFetch, buildXml, QloAppsError } from "@/lib/qloapps-client";
import { isLocalPms } from "@/lib/pms-backend";
import { prisma } from "@/lib/prisma";
import { recordPayment } from "@/lib/finance";
import { writeAudit } from "@/lib/audit";
import { completeWebhook, registerWebhook } from "@/lib/webhooks";

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
  const eventId = data?.id ?? `${payload.event ?? "unknown"}:${data?.metadata?.booking_id ?? "missing"}`;
  let webhook;
  try {
    webhook = await registerWebhook("xendit-payment-request", eventId, payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook conflict" }, { status: 409 });
  }
  if (webhook.duplicate) return NextResponse.json({ received: true, duplicate: true });
  const succeeded = payload.event === "payment.succeeded" && data?.status === "SUCCEEDED";
  if (!succeeded) {
    // Acknowledge other events so Xendit doesn't retry them.
    await completeWebhook(webhook.id, "IGNORED");
    return NextResponse.json({ received: true });
  }

  const bookingId = data?.metadata?.booking_id;
  if (!bookingId) {
    console.warn("[xendit-webhook] payment.succeeded without metadata.booking_id");
    await completeWebhook(webhook.id, "FAILED", "Missing booking id");
    return NextResponse.json({ received: true });
  }

  if (isLocalPms()) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      await completeWebhook(webhook.id, "FAILED", "Booking not found");
      return NextResponse.json({ error: "VillaOS booking not found" }, { status: 404 });
    }
    if (booking.status === "CONFIRMED") {
      await completeWebhook(webhook.id, "PROCESSED");
      return NextResponse.json({ received: true, alreadyPaid: true });
    }
    if (typeof data.amount === "number" && Math.round(data.amount) !== booking.totalAmount) {
      console.error("[xendit-webhook] amount mismatch", {
        bookingId,
        expected: booking.totalAmount,
        received: data.amount,
      });
      await completeWebhook(webhook.id, "FAILED", "Payment amount mismatch");
      return NextResponse.json({ error: "Payment amount mismatch" }, { status: 409 });
    }
    if (booking.status !== "PENDING_PAYMENT") {
      await completeWebhook(webhook.id, "FAILED", `Invalid booking status: ${booking.status}`);
      return NextResponse.json({ error: `Invalid booking status: ${booking.status}` }, { status: 409 });
    }
    await recordPayment({
      bookingId: booking.id,
      provider: "xendit",
      providerRef: data.id ?? booking.paymentRef ?? eventId,
      amount: booking.totalAmount,
      method: "QRIS",
      metadata: payload,
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "CONFIRMED",
        paymentProvider: "xendit",
        paymentRef: data.id ?? booking.paymentRef,
      },
    });
    await writeAudit({ action: "PAYMENT_WEBHOOK_CONFIRMED", entityType: "BOOKING", entityId: booking.id, before: { status: booking.status }, after: { status: "CONFIRMED", provider: "xendit" } });
    await completeWebhook(webhook.id, "PROCESSED");
    return NextResponse.json({ received: true, updated: true, backend: "villaos" });
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

    await completeWebhook(webhook.id, "PROCESSED");

    return NextResponse.json({ received: true, updated: true });
  } catch (err) {
    // Return 500 so Xendit retries; the idempotency check above prevents a
    // double update once it eventually succeeds.
    const message =
      err instanceof QloAppsError ? err.message : err instanceof Error ? err.message : "error";
    console.error("[xendit-webhook] QloApps update failed:", message);
    await completeWebhook(webhook.id, "FAILED", message);
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
