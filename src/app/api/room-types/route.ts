import { NextRequest, NextResponse } from "next/server";
import { qloFetch, QloAppsError, flattenLang } from "@/lib/qloapps-client";
import { isLocalPms, localRoomTypes } from "@/lib/pms-backend";

export const dynamic = "force-dynamic";

/**
 * GET /api/room-types          → list of room types (simplified)
 * GET /api/room-types?id=1     → a single room type with full detail
 *
 * Image URLs point at our own /api/room-image proxy so the QloApps ws_key
 * is never placed in a browser-visible <img src>.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  try {
    if (isLocalPms()) {
      const list = await localRoomTypes();
      if (id) {
        const roomType = list.find((room) => room.id === Number(id));
        if (!roomType) {
          return NextResponse.json({ error: "Room type tidak ditemukan" }, { status: 404 });
        }
        return NextResponse.json({ roomType });
      }
      return NextResponse.json({ roomTypes: list, backend: "villaos" });
    }

    if (id) {
      const data = await qloFetch<{ room_type?: RawRoomType }>(
        `/api/room_types/${encodeURIComponent(id)}`
      );
      if (!data.room_type) {
        return NextResponse.json({ error: "Room type tidak ditemukan" }, { status: 404 });
      }
      return NextResponse.json({ roomType: simplify(data.room_type) });
    }

    // display=full returns every field (incl. image associations) in one call.
    const data = await qloFetch<{ room_types?: RawRoomType[] }>("/api/room_types", {
      query: { display: "full" },
    });
    const list = Array.isArray(data.room_types) ? data.room_types : [];
    return NextResponse.json({ roomTypes: list.map(simplify) });
  } catch (err) {
    return errorResponse(err);
  }
}

type RawRoomType = {
  id?: string | number;
  price?: string | number;
  name?: unknown;
  description?: unknown;
  description_short?: unknown;
  associations?: {
    images?: Array<{ id?: string | number }>;
  };
};

type SimpleRoomType = {
  id: number;
  name: string;
  description: string;
  pricePerNight: number;
  images: string[];
};

function simplify(raw: RawRoomType): SimpleRoomType {
  const id = Number(raw.id ?? 0);
  const imageIds = (raw.associations?.images ?? [])
    .map((img) => Number(img.id))
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    id,
    name: flattenLang(raw.name),
    // Prefer the long description; fall back to the short one.
    description:
      stripHtml(flattenLang(raw.description)) ||
      stripHtml(flattenLang(raw.description_short)),
    pricePerNight: Math.round(Number(raw.price ?? 0)),
    // Served through our proxy route — no ws_key exposed to the client.
    images: imageIds.map((imageId) => `/api/room-image/${id}/${imageId}`),
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function errorResponse(err: unknown) {
  if (err instanceof QloAppsError) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 502 });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
