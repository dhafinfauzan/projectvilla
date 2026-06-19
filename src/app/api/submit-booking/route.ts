import { NextRequest, NextResponse } from "next/server";
import { qloFetch, buildXml, QloAppsError } from "@/lib/qloapps-client";
import { createQrisPaymentRequest } from "@/lib/xendit";

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
