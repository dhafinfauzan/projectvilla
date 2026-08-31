import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { recordPayment } from "@/lib/finance";
import { releaseBookingInventory } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { completeWebhook, registerWebhook } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const provider = (process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase();
  if (provider === "midtrans" && !verifyMidtransSignature(payload)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  if (provider === "xendit" && !verifyXenditToken(req)) return NextResponse.json({ error: "Invalid callback token" }, { status: 401 });
  if (provider === "mock" && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Mock webhooks are disabled in production" }, { status: 403 });

  const bookingCode = String(payload.order_id ?? payload.external_id ?? "");
  const rawStatus = String(payload.transaction_status ?? payload.status ?? "");
  if (!bookingCode || !rawStatus) return NextResponse.json({ error: "Unrecognized payload" }, { status: 400 });
  const providerRef = String(payload.transaction_id ?? payload.id ?? `${bookingCode}:${rawStatus}`);
  let event;
  try { event = await registerWebhook(provider, providerRef, payload); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook conflict" }, { status: 409 }); }
  if (event.duplicate) return NextResponse.json({ received: true, duplicate: true });

  const fraudStatus = payload.fraud_status as string | undefined;
  const isPaid = rawStatus === "settlement" || rawStatus === "PAID" || rawStatus === "SETTLED" || (rawStatus === "capture" && fraudStatus !== "challenge" && fraudStatus !== "deny");
  const failed = ["deny", "cancel", "expire", "EXPIRED", "FAILED"].includes(rawStatus);
  if (!isPaid && !failed) {
    await completeWebhook(event.id, "IGNORED");
    return NextResponse.json({ received: true });
  }

  const booking = await prisma.booking.findUnique({ where: { bookingCode } });
  if (!booking) {
    await completeWebhook(event.id, "FAILED", "Booking not found");
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  try {
    if (isPaid) {
      if (booking.status !== "PENDING_PAYMENT" && booking.status !== "CONFIRMED") throw new Error(`Invalid booking status: ${booking.status}`);
      const incomingAmount = Number(payload.gross_amount ?? payload.amount ?? booking.totalAmount);
      if (Math.round(incomingAmount) !== booking.totalAmount) throw new Error("Payment amount mismatch");
      await recordPayment({ bookingId: booking.id, provider, providerRef, amount: booking.totalAmount, method: String(payload.payment_type ?? payload.payment_method ?? "ONLINE"), metadata: payload });
      if (booking.status === "PENDING_PAYMENT") await prisma.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED", paymentProvider: provider, paymentRef: providerRef } });
      await writeAudit({ action: "PAYMENT_WEBHOOK_CONFIRMED", entityType: "BOOKING", entityId: booking.id, before: { status: booking.status }, after: { status: "CONFIRMED", provider, providerRef } });
    } else {
      if (booking.status === "PENDING_PAYMENT") {
        await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
        await releaseBookingInventory(booking.id);
      }
      await writeAudit({ action: "PAYMENT_WEBHOOK_FAILED", entityType: "BOOKING", entityId: booking.id, before: { status: booking.status }, after: { status: "CANCELLED", provider, rawStatus } });
    }
    await completeWebhook(event.id, "PROCESSED");
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    await completeWebhook(event.id, "FAILED", message);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

function verifyMidtransSignature(payload: Record<string, unknown>): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const { order_id, status_code, gross_amount, signature_key } = payload as { order_id?: string; status_code?: string; gross_amount?: string; signature_key?: string };
  if (!serverKey || !order_id || !status_code || !gross_amount || !signature_key) return false;
  return safeEqual(createHash("sha512").update(order_id + status_code + gross_amount + serverKey).digest("hex"), signature_key);
}

function verifyXenditToken(req: NextRequest): boolean {
  const expected = process.env.XENDIT_CALLBACK_TOKEN;
  const received = req.headers.get("x-callback-token");
  return Boolean(expected && received && safeEqual(expected, received));
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
