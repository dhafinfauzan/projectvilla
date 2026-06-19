"use client";

import { useEffect, useState } from "react";

export type RoomType = {
  id: number;
  name: string;
  description: string;
  pricePerNight: number;
  images: string[];
};

/**
 * Loads the room types from QloApps via /api/room-types. Single source of
 * truth for every page that shows villas/rooms (home, /rooms).
 */
export function useRoomTypes() {
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/room-types")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Gagal memuat kamar");
        return data;
      })
      .then((data) => active && setRooms(data.roomTypes ?? []))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { rooms, loading, error };
}
