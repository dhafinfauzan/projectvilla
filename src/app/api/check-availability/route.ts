import { NextRequest, NextResponse } from "next/server";
import { qloFetch, buildXml, QloAppsError, flattenLang } from "@/lib/qloapps-client";

export const dynamic = "force-dynamic";

const ID_HOTEL = Number(process.env.QLOAPPS_ID_HOTEL ?? 1);
// When QloApps can't be reached (env not set, ngrok down, etc.) fall back to
// placeholder data so the booking flow still works for testing/demo. Set
// QLOAPPS_DEMO_FALLBACK="false" to disable and surface the real error instead.
const DEMO_FALLBACK = process.env.QLOAPPS_DEMO_FALLBACK !== "false";

// Mirrors the three villas in src/lib/villas.ts (ids 1/2/3) so any villa the
// guest picks resolves to an "available" room type in demo mode.
const DEMO_ROOMS = [
  { id: 1, name: "Taru Garden Villa", pricePerNight: 4200000 },
  { id: 2, name: "Taru River Villa", pricePerNight: 6800000 },
  { id: 3, name: "Taru Sky Estate", pricePerNight: 12500000 },
];

function demoAvailability(
  date_from: string,
  date_to: string,
  adults: number,
  children: number,
  nights: number
) {
  return {
    dateFrom: date_from,
    dateTo: date_to,
    nights,
    adults,
    children,
    totalAvailableRooms: DEMO_ROOMS.length,
    mode: "demo" as const,
    roomTypes: DEMO_ROOMS.map((r) => ({
      id: r.id,
      name: r.name,
      basePricePerNight: r.pricePerNight,
      totalPrice: r.pricePerNight * nights,
      pricePerNight: r.pricePerNight,
      availableRooms: 3,
    })),
  };
}

/**
 * POST /api/check-availability
 * Body: { date_from, date_to, adults?, children? }  (dates as YYYY-MM-DD)
 *
 * Posts a hotel_ari (Availability/Rates/Inventory) request to QloApps and
 * returns the room types that are bookable in the date range, with the
 * total price and a derived per-night price.
 */
export async function POST(req: NextRequest) {
  let body: {
    date_from?: string;
    date_to?: string;
    adults?: number;
    children?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { date_from, date_to } = body;
  const adults = Number(body.adults ?? 2);
  const children = Number(body.children ?? 0);

  if (!date_from || !date_to) {
    return NextResponse.json(
      { error: "date_from dan date_to wajib diisi (format YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const nights = nightsBetween(date_from, date_to);
  if (nights < 1) {
    return NextResponse.json({ error: "Rentang tanggal tidak valid" }, { status: 400 });
  }

  const xml = buildXml(
    {
      hotel_ari: {
        id_hotel: ID_HOTEL,
        date_from,
        date_to,
        get_available_rooms: 1,
        get_booked_rooms: 1,
        get_partial_available_rooms: 1,
        get_unavailable_rooms: 1,
        associations: {
          room_occupancies: {
            room_occupancy: { adults, children },
          },
        },
      },
    },
    "qloapps"
  );

  try {
    const data = await qloFetch<HotelAriResponse>("/api/hotel_ari", {
      method: "POST",
      body: xml,
    });

    const ari = data.hotel_ari;
    const rawTypes = Array.isArray(ari?.room_types) ? ari!.room_types : [];

    const available = rawTypes
      .map((rt) => {
        const totalPrice = Math.round(Number(rt.total_price_with_tax ?? 0));
        const basePrice = Math.round(Number(rt.base_price_with_tax ?? 0));
        const availableCount = Array.isArray(rt.rooms?.available)
          ? rt.rooms!.available.length
          : 0;
        return {
          id: Number(rt.id_room_type),
          name: flattenLang(rt.name),
          basePricePerNight: basePrice,
          totalPrice,
          // Derive per-night from the total when QloApps doesn't return a base.
          pricePerNight: basePrice || Math.round(totalPrice / nights),
          availableRooms: availableCount,
        };
      })
      .filter((rt) => rt.availableRooms > 0 || rt.totalPrice > 0);

    return NextResponse.json({
      dateFrom: date_from,
      dateTo: date_to,
      nights,
      adults,
      children,
      totalAvailableRooms: Number(ari?.total_available_rooms ?? 0),
      mode: "live" as const,
      roomTypes: available,
    });
  } catch (err) {
    // QloApps unreachable/unconfigured — keep the demo working.
    if (DEMO_FALLBACK) {
      console.warn(
        "[check-availability] QloApps failed, using demo fallback:",
        err instanceof Error ? err.message : err
      );
      return NextResponse.json(demoAvailability(date_from, date_to, adults, children, nights));
    }
    if (err instanceof QloAppsError) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type HotelAriResponse = {
  hotel_ari?: {
    total_available_rooms?: string | number;
    room_types?: Array<{
      id_room_type?: string | number;
      base_price_with_tax?: string | number;
      total_price_with_tax?: string | number;
      name?: unknown;
      rooms?: { available?: unknown[]; booked?: unknown[] };
    }>;
  };
};

function nightsBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
