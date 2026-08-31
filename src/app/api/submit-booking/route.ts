import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { qloFetch, buildXml, QloAppsError } from "@/lib/qloapps-client";
import { createQrisPaymentRequest } from "@/lib/xendit";
import { findVillaByCompatibilityId, isLocalPms } from "@/lib/pms-backend";
import { prisma } from "@/lib/prisma";
import { expireStaleBookings } from "@/lib/bookings";
import { allocateUnitForBooking } from "@/lib/inventory";
import { getRateQuote } from "@/lib/rates";
import { ensureFolioForBooking } from "@/lib/finance";
import { rateLimit, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ID_PROPERTY = Number(process.env.QLOAPPS_ID_HOTEL ?? 1);
// QloApps validates currency by ISO code (Currency::getIdByIsoCode), not id.
const CURRENCY = process.env.QLOAPPS_CURRENCY ?? "IDR";
// booking_status: 1=new … 4=refunded. payment_status: 1=completed, 2=partial,
// 3=awaiting. A pending website booking is new + awaiting payment.
const BOOKING_STATUS = process.env.QLOAPPS_BOOKING_STATUS ?? "1";
const PAYMENT_STATUS = process.env.QLOAPPS_PAYMENT_STATUS ?? "3";
const BOOKING_SOURCE = "Website Custom";

/**
 * POST /api/submit-booking
 * Body: { firstname, lastname, email, phone, id_room_type,
 *         checkin_date, checkout_date, total_price }
 *
 * Creates a PENDING booking in QloApps. Payment is handled manually by staff
 * in the QloApps admin (Indonesian payment gateways aren't wired up yet).
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(`submit-booking:${requestIp(req.headers)}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!limited.allowed) return NextResponse.json({ error: "Terlalu banyak percobaan booking. Coba lagi nanti." }, { status: 429, headers: { "retry-after": String(limited.retryAfter) } });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    firstname,
    lastname,
    email,
    phone,
    id_room_type,
    checkin_date,
    checkout_date,
    total_price,
  } = body as {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    id_room_type?: string | number;
    checkin_date?: string;
    checkout_date?: string;
    total_price?: number;
  };
  const numberOfRooms = Number((body as { number_of_rooms?: number }).number_of_rooms ?? 1);

  const missing = Object.entries({
    firstname,
    lastname,
    email,
    phone,
    id_room_type,
    checkin_date,
    checkout_date,
  })
    .filter(([, v]) => v == null || v === "")
    .map(([k]) => k);
  if (missing.length) {
    return NextResponse.json(
      { error: `Field wajib belum lengkap: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  if (isLocalPms()) {
    if (numberOfRooms !== 1) {
      return NextResponse.json(
        { error: "VillaOS checkout saat ini mendukung satu room type per booking." },
        { status: 400 }
      );
    }
    const checkIn = new Date(`${checkin_date}T14:00:00`);
    const checkOut = new Date(`${checkout_date}T11:00:00`);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
    const adults = Number((body as { adults?: number }).adults ?? 2);
    const children = Number((body as { children?: number }).children ?? 0);
    const villa = await findVillaByCompatibilityId(Number(id_room_type));
    if (!villa) return NextResponse.json({ error: "Room type tidak ditemukan" }, { status: 404 });
    if (nights < 1 || !Number.isFinite(checkIn.getTime()) || !Number.isFinite(checkOut.getTime())) {
      return NextResponse.json({ error: "Rentang tanggal tidak valid" }, { status: 400 });
    }
    if (adults + children < 1 || adults + children > villa.maxGuests) {
      return NextResponse.json({ error: `Kapasitas maksimal ${villa.maxGuests} tamu.` }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return NextResponse.json({ error: "Alamat email tidak valid" }, { status: 400 });
    }

    await expireStaleBookings();
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
      return NextResponse.json({ error: "Idempotency key tidak valid" }, { status: 400 });
    }
    if (idempotencyKey) {
      const existing = await prisma.booking.findUnique({ where: { idempotencyKey } });
      if (existing) return NextResponse.json({ success: true, bookingId: existing.id, bookingCode: existing.bookingCode, status: existing.status, amount: existing.totalAmount, paymentRequestId: existing.paymentRef, idempotentReplay: true, backend: "villaos" });
    }
    const quote = await getRateQuote(villa, checkIn, checkOut);
    if (!quote.sellable) return NextResponse.json({ error: "Tanggal tidak dapat dijual untuk rate yang dipilih", restrictions: quote.restrictions }, { status: 409 });
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `TARU-${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`,
        idempotencyKey,
        villaId: villa.id,
        checkIn,
        checkOut,
        guests: adults + children,
        guestName: `${firstname} ${lastname}`.trim(),
        email: String(email),
        phone: String(phone),
        nights,
        totalAmount: quote.total,
        status: "PENDING_PAYMENT",
        source: "DIRECT_WEB",
        paymentProvider: "xendit",
      },
    });
    const assigned = await allocateUnitForBooking({ bookingId: booking.id, villaId: villa.id, checkIn, checkOut });
    if (!assigned) {
      await prisma.booking.delete({ where: { id: booking.id } });
      return NextResponse.json({ error: "Villa baru saja terisi untuk tanggal tersebut." }, { status: 409 });
    }
    await ensureFolioForBooking(booking.id);

    try {
      const qris = await createQrisPaymentRequest({
        bookingId: booking.id,
        amount: booking.totalAmount,
        checkinDate: checkin_date,
        checkoutDate: checkout_date,
      });
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentRef: qris.paymentRequestId },
      });
      return NextResponse.json({
        success: true,
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        status: "PENDING",
        qrString: qris.qrString,
        paymentRequestId: qris.paymentRequestId,
        paymentMethodId: qris.paymentMethodId,
        amount: qris.amount,
        expiresAt: qris.expiresAt,
        testMode: qris.testMode,
        backend: "villaos",
      });
    } catch (qErr) {
      const detail = qErr instanceof Error ? qErr.message : String(qErr);
      console.error("[submit-booking] VillaOS QRIS creation failed:", detail);
      return NextResponse.json({
        success: true,
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        status: "PENDING",
        amount: booking.totalAmount,
        qrError: `Gagal menyiapkan QRIS: ${detail}`,
        backend: "villaos",
      });
    }
  }

  try {
    const bookingXml = buildXml(
      {
        booking: {
          id_property: ID_PROPERTY,
          currency: CURRENCY,
          booking_status: BOOKING_STATUS,
          payment_status: PAYMENT_STATUS,
          source: BOOKING_SOURCE,
          customer_detail: {
            firstname,
            lastname,
            email,
            phone,
          },
          room_types: {
            room_type: {
              id_room_type,
              checkin_date,
              checkout_date,
              number_of_rooms: numberOfRooms,
              // No <rooms> block: QloApps auto-assigns rooms, applies the
              // room type's default occupancy, and computes the price itself.
              // Sending per-room detail would require unit_price/total_tax etc.
            },
          },
          price_details: {
            // Nothing paid yet — payment is collected manually (awaiting).
            total_paid: 0,
            total_price_with_tax: Math.round(Number(total_price ?? 0)),
          },
        },
      },
      "prestashop"
    );

    const created = await qloFetch<CreatedBooking>("/api/bookings", {
      method: "POST",
      body: bookingXml,
    });

    const bookingId = extractBookingId(created);
    if (!bookingId) {
      return NextResponse.json(
        {
          error:
            "Booking terkirim tapi QloApps tidak mengembalikan ID. Cek dashboard admin untuk memastikan.",
          raw: created,
        },
        { status: 502 }
      );
    }

    // Booking exists in QloApps (pending). Generate the QRIS to pay it now.
    // If Xendit fails, still return the booking so it isn't lost — the guest
    // can be invoiced manually.
    const amount = Math.round(Number(total_price ?? 0));
    try {
      const qris = await createQrisPaymentRequest({
        bookingId,
        amount,
        checkinDate: checkin_date,
        checkoutDate: checkout_date,
      });
      return NextResponse.json({
        success: true,
        bookingId,
        status: "PENDING",
        qrString: qris.qrString,
        paymentRequestId: qris.paymentRequestId,
        paymentMethodId: qris.paymentMethodId,
        amount: qris.amount,
        expiresAt: qris.expiresAt,
        testMode: qris.testMode,
      });
    } catch (qErr) {
      const detail = qErr instanceof Error ? qErr.message : String(qErr);
      console.error("[submit-booking] QRIS creation failed:", detail);
      return NextResponse.json({
        success: true,
        bookingId,
        status: "PENDING",
        amount,
        qrError: `Gagal menyiapkan QRIS: ${detail}`,
      });
    }
  } catch (err) {
    if (err instanceof QloAppsError) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreatedBooking = {
  booking?: { id?: string | number };
  bookings?: { booking?: { id?: string | number } };
};

function extractBookingId(data: CreatedBooking): number | null {
  const id = data.booking?.id ?? data.bookings?.booking?.id;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}
