import { prisma } from "@/lib/prisma";

/**
 * How long an unpaid booking holds its dates. Payment sessions (Midtrans
 * Snap / Xendit invoice) are created with the same window, so the gateway
 * session and the hold expire together.
 */
export const BOOKING_HOLD_MINUTES = 60;

/**
 * Marks PENDING_PAYMENT bookings older than the hold window as EXPIRED so
 * they stop blocking availability. Called lazily from the availability and
 * booking endpoints (and the admin page) — no cron needed. The payment
 * webhook still confirms a booking if the gateway reports a late success.
 */
export async function expireStaleBookings(): Promise<number> {
  const cutoff = new Date(Date.now() - BOOKING_HOLD_MINUTES * 60_000);
  const { count } = await prisma.booking.updateMany({
    where: {
      status: "PENDING_PAYMENT",
      createdAt: { lt: cutoff },
    },
    data: { status: "EXPIRED" },
  });
  return count;
}
