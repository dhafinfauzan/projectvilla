import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPaymentSession } from "@/lib/payment";

function generateBookingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `TARU-${code}`;
}

/**
 * POST /api/bookings
 * Body: { villa, checkIn, checkOut, guests, guestName, email, phone, specialRequests? }
 * Creates a PENDING_PAYMENT booking and returns a payment session redirect.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { villa: slug, checkIn, checkOut, guests, guestName, email, phone, specialRequests } = body as {
    villa?: string;
    checkIn?: string;
    checkOut?: string;
    guests?: number;
    guestName?: string;
    email?: string;
    phone?: string;
    specialRequests?: string;
  };

  if (!slug || !checkIn || !checkOut || !guests || !guestName || !email || !phone) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const nights = Math.round((outDate.getTime() - inDate.getTime()) / 86400000);
  if (isNaN(nights) || nights < 1) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (inDate < today) {
    return NextResponse.json({ error: "Check-in date is in the past" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const villa = await prisma.villa.findUnique({ where: { slug } });
  if (!villa) {
    return NextResponse.json({ error: "Villa not found" }, { status: 404 });
  }

  if (guests < 1 || guests > villa.maxGuests) {
    return NextResponse.json(
      { error: `This villa accommodates up to ${villa.maxGuests} guests` },
      { status: 400 }
    );
  }

  // Availability check inside a transaction to avoid double-booking races.
  const booking = await prisma.$transaction(async (tx) => {
    const overlapping = await tx.booking.count({
      where: {
        villaId: villa.id,
        status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
        checkIn: { lt: outDate },
        checkOut: { gt: inDate },
      },
    });
    if (overlapping >= villa.totalUnits) return null;

    return tx.booking.create({
      data: {
        bookingCode: generateBookingCode(),
        villaId: villa.id,
        checkIn: inDate,
        checkOut: outDate,
        guests,
        guestName,
        email,
        phone,
        specialRequests: specialRequests || null,
        nights,
        // Total is always computed server-side from the stored price.
        totalAmount: nights * villa.pricePerNight,
      },
    });
  });

  if (!booking) {
    return NextResponse.json(
      { error: "Villa is no longer available for these dates" },
      { status: 409 }
    );
  }

  const payment = await createPaymentSession({
    bookingCode: booking.bookingCode,
    totalAmount: booking.totalAmount,
    guestName,
    email,
    phone,
    villaName: villa.name,
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentProvider: payment.provider, paymentRef: payment.reference },
  });

  return NextResponse.json({
    bookingCode: booking.bookingCode,
    totalAmount: booking.totalAmount,
    redirectUrl: payment.redirectUrl,
  });
}

/**
 * GET /api/bookings?code=TARU-XXXXXX
 * Returns booking details for the confirmation page.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing booking code" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code },
    include: { villa: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({
    booking: {
      bookingCode: booking.bookingCode,
      villaName: booking.villa.name,
      villaSlug: booking.villa.slug,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      guests: booking.guests,
      guestName: booking.guestName,
      totalAmount: booking.totalAmount,
      status: booking.status,
    },
  });
}
