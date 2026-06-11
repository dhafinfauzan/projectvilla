import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/payment/webhook
 *
 * Payment gateway webhook endpoint. Point your gateway's notification URL here:
 *  - Midtrans: Settings -> Configuration -> Payment Notification URL
 *  - Xendit:   Settings -> Webhooks -> Invoices paid (set the verification
 *    token as XENDIT_CALLBACK_TOKEN)
 *
 * Signatures are verified before any booking is touched:
 *  - Midtrans: sha512(order_id + status_code + gross_amount + SERVER_KEY)
 *    must equal the payload's signature_key.
 *  - Xendit: the x-callback-token header must equal XENDIT_CALLBACK_TOKEN.
 */
export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = process.env.PAYMENT_PROVIDER ?? "mock";

  if (provider === "midtrans") {
    if (!verifyMidtransSignature(payload)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (provider === "xendit") {
    if (!verifyXenditToken(req)) {
      return NextResponse.json({ error: "Invalid callback token" }, { status: 401 });
    }
  }
  // "mock" provider: no gateway is configured, so no signature to verify.
  // The endpoint only flips statuses between known states and never moves
  // money, but switch PAYMENT_PROVIDER before exposing it publicly.

  // Midtrans sends `order_id` + `transaction_status`; Xendit sends
  // `external_id` + `status`. Both map onto bookingCode + a paid/failed state.
  const bookingCode = (payload.order_id ?? payload.external_id) as string | undefined;
  const rawStatus = (payload.transaction_status ?? payload.status) as string | undefined;

  if (!bookingCode || !rawStatus) {
    return NextResponse.json({ error: "Unrecognized payload" }, { status: 400 });
  }

  // Midtrans "capture" is only money-in-hand when fraud_status is "accept".
  const fraudStatus = payload.fraud_status as string | undefined;
  const isPaid =
    rawStatus === "settlement" ||
    rawStatus === "PAID" ||
    rawStatus === "SETTLED" ||
    (rawStatus === "capture" && fraudStatus !== "challenge" && fraudStatus !== "deny");

  const failedStatuses = ["deny", "cancel", "expire", "EXPIRED", "FAILED"];

  let newStatus: string | null = null;
  if (isPaid) newStatus = "CONFIRMED";
  else if (failedStatuses.includes(rawStatus)) newStatus = "CANCELLED";

  if (!newStatus) {
    return NextResponse.json({ received: true });
  }

  try {
    await prisma.booking.update({
      where: { bookingCode },
      data: { status: newStatus },
    });
  } catch {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({ received: true });
}

function verifyMidtransSignature(payload: Record<string, unknown>): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const { order_id, status_code, gross_amount, signature_key } = payload as {
    order_id?: string;
    status_code?: string;
    gross_amount?: string;
    signature_key?: string;
  };
  if (!serverKey || !order_id || !status_code || !gross_amount || !signature_key) {
    return false;
  }

  const expected = createHash("sha512")
    .update(order_id + status_code + gross_amount + serverKey)
    .digest("hex");

  return safeEqual(expected, signature_key);
}

function verifyXenditToken(req: NextRequest): boolean {
  const expected = process.env.XENDIT_CALLBACK_TOKEN;
  const received = req.headers.get("x-callback-token");
  if (!expected || !received) return false;
  return safeEqual(expected, received);
}

/** Constant-time string comparison to avoid timing attacks. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
