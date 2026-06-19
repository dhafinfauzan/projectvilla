import { NextRequest, NextResponse } from "next/server";
import { createQrisPaymentRequest } from "@/lib/xendit";

export const dynamic = "force-dynamic";

/**
 * POST /api/xendit/create-qris
 * Body: { bookingId, amount, checkinDate?, checkoutDate? }
 *
 * Generates a QRIS payment request and returns the qr_string for the guest to
 * scan. Normally called server-side from /api/submit-booking, but exposed here
 * too (e.g. to regenerate an expired QR).
 */
export async function POST(req: NextRequest) {
  let body: {
    bookingId?: string | number;
    amount?: number;
    checkinDate?: string;
    checkoutDate?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { bookingId, amount, checkinDate, checkoutDate } = body;
  if (!bookingId || !amount || amount <= 0) {
    return NextResponse.json(
      { error: "bookingId dan amount (> 0) wajib diisi" },
      { status: 400 }
    );
  }

  try {
    const session = await createQrisPaymentRequest({
      bookingId,
      amount,
      checkinDate,
      checkoutDate,
    });
    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal membuat QRIS";
    console.error("[create-qris]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
