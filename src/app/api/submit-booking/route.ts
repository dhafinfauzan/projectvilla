import { NextRequest, NextResponse } from "next/server";
import { qloFetch, buildXml, QloAppsError } from "@/lib/qloapps-client";

export const dynamic = "force-dynamic";

const ID_PROPERTY = Number(process.env.QLOAPPS_ID_HOTEL ?? 1);
// QloApps rejects bookings without a currency. Default 1 is the first/default
// currency in a QloApps install; override if yours differs.
const ID_CURRENCY = Number(process.env.QLOAPPS_ID_CURRENCY ?? 1);
// Booking/payment status codes vary per QloApps install. Confirm the valid
// values from schema=synopsis (logged below) and override via env if needed.
const BOOKING_STATUS = process.env.QLOAPPS_BOOKING_STATUS ?? "1"; // "Awaiting payment"
const PAYMENT_STATUS = process.env.QLOAPPS_PAYMENT_STATUS ?? "0"; // unpaid / pending
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
    // Inspect the official validation rules / blank schema before writing.
    // Logged for development diagnostics so field names can be confirmed
    // without trial-and-error.
    try {
      const synopsis = await qloFetch("/api/bookings", { query: { schema: "synopsis" } });
      console.log("[submit-booking] bookings synopsis:", JSON.stringify(synopsis));
    } catch (e) {
      console.warn(
        "[submit-booking] could not fetch bookings synopsis:",
        e instanceof Error ? e.message : e
      );
    }

    const bookingXml = buildXml(
      {
        booking: {
          id_property: ID_PROPERTY,
          id_currency: ID_CURRENCY,
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
            },
          },
          price_details: {
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

    return NextResponse.json({
      success: true,
      bookingId,
      status: "PENDING",
      message: "Booking berhasil dibuat. Pembayaran diproses manual oleh staff.",
    });
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
