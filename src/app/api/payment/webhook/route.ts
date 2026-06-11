import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/payment/webhook
 *
 * Payment gateway webhook endpoint. Point your gateway's notification URL here:
 *  - Midtrans: Settings -> Configuration -> Payment Notification URL
 *  - Xendit:   Settings -> Webhooks -> Invoices paid
 *
 * IMPORTANT: before going live, verify the webhook signature:
 *  - Midtrans: sha512(order_id + status_code + gross_amount + SERVER_KEY) === signature_key
 *  - Xendit:   compare x-callback-token header against XENDIT_WEBHOOK_TOKEN
 */
export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Midtrans sends `order_id` + `transaction_status`; Xendit sends
  // `external_id` + `status`. Both map onto bookingCode + a paid/failed state.
  const bookingCode = (payload.order_id ?? payload.external_id) as string | undefined;
  const rawStatus = (payload.transaction_status ?? payload.status) as string | undefined;

  if (!bookingCode || !rawStatus) {
    return NextResponse.json({ error: "Unrecognized payload" }, { status: 400 });
  }

  const paidStatuses = ["capture", "settlement", "PAID", "SETTLED"];
  const failedStatuses = ["deny", "cancel", "expire", "EXPIRED", "FAILED"];

  let newStatus: string | null = null;
  if (paidStatuses.includes(rawStatus)) newStatus = "CONFIRMED";
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
