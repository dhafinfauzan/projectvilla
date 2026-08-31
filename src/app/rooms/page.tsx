"use client";

import Link from "next/link";
import { useState } from "react";
import { formatIDR } from "@/lib/format";
import { useRoomTypes, type RoomType } from "@/lib/useRoomTypes";

/**
 * Villas/rooms page — browse VillaOS room types and check live availability.
 * Booking + payment happens on the dedicated /checkout page.
 */

type Availability = {
  id: number;
  name: string;
  totalPrice: number;
  pricePerNight: number;
  availableRooms: number;
};

type Search = { dateFrom: string; dateTo: string; adults: number; children: number };

const today = new Date().toISOString().slice(0, 10);

export default function RoomsPage() {
  const { rooms, loading, error: loadError } = useRoomTypes();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [checking, setChecking] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability[] | null>(null);

  async function checkAvailability() {
    if (!dateFrom || !dateTo) return;
    setChecking(true);
    setAvailError(null);
    setAvailability(null);
    try {
      const res = await fetch("/api/check-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo, adults, children }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal cek ketersediaan");
      setAvailability(data.roomTypes ?? []);
    } catch (e) {
      setAvailError(e instanceof Error ? e.message : "Error");
    } finally {
      setChecking(false);
    }
  }

  const availabilityFor = (id: number) =>
    availability?.find((a) => a.id === id) ?? null;

  const search: Search = { dateFrom, dateTo, adults, children };

  return (
    <div className="min-h-svh bg-ink px-5 pb-24 pt-32 text-cream md:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs tracking-[0.3em] uppercase text-gold-light">
          Ubud · Bali
        </p>
        <h1 className="mt-2 font-serif text-3xl md:text-5xl">Our Villas</h1>

        {/* Availability search */}
        <div className="mt-10 grid gap-4 border border-cream/15 bg-cream/5 p-6 md:grid-cols-[1fr_1fr_auto_auto_auto]">
          <label className="block">
            <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-cream/60">
              Check-in
            </span>
            <input
              type="date"
              min={today}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-cream/25 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-gold"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-cream/60">
              Check-out
            </span>
            <input
              type="date"
              min={dateFrom || today}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-cream/25 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-gold"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-cream/60">
              Adults
            </span>
            <input
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))}
              className="w-20 border border-cream/25 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-gold"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-cream/60">
              Children
            </span>
            <input
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))}
              className="w-20 border border-cream/25 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-gold"
            />
          </label>
          <button
            onClick={checkAvailability}
            disabled={!dateFrom || !dateTo || checking}
            className="self-end border border-gold bg-gold/10 px-6 py-2.5 text-xs tracking-[0.25em] uppercase text-gold-light transition enabled:hover:bg-gold enabled:hover:text-ink disabled:opacity-40"
          >
            {checking ? "Checking…" : "Check"}
          </button>
        </div>

        {availError && (
          <p className="mt-4 border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-200">
            {availError}
          </p>
        )}

        {/* Room list */}
        {loading ? (
          <p className="mt-12 text-center text-cream/50">Memuat kamar…</p>
        ) : loadError ? (
          <div className="mt-12 border border-red-400/40 bg-red-400/10 p-6 text-sm text-red-200">
            <p className="font-semibold">Gagal memuat data kamar dari VillaOS:</p>
            <p className="mt-2">{loadError}</p>
          </div>
        ) : rooms.length === 0 ? (
          <p className="mt-12 text-center text-cream/50">
            Belum ada room type di VillaOS.
          </p>
        ) : (
          <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                availability={availabilityFor(room.id)}
                search={search}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoomCard({
  room,
  availability,
  search,
}: {
  room: RoomType;
  availability: Availability | null;
  search: Search;
}) {
  const price = availability?.pricePerNight || room.pricePerNight;
  const datesPicked = Boolean(search.dateFrom && search.dateTo);
  const soldOut = availability != null && availability.availableRooms === 0;

  const checkoutHref =
    `/checkout?roomType=${room.id}` +
    `&from=${encodeURIComponent(search.dateFrom)}` +
    `&to=${encodeURIComponent(search.dateTo)}` +
    `&adults=${search.adults}&children=${search.children}` +
    `&name=${encodeURIComponent(room.name)}`;

  return (
    <div className="overflow-hidden border border-cream/15 bg-cream/5">
      <div className="relative h-48 bg-ink">
        {room.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- proxied QloApps image
          <img
            src={room.images[0]}
            alt={room.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-cream/30">
            No image
          </div>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-serif text-lg">{room.name}</h3>
        {room.description && (
          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-cream/60">
            {room.description}
          </p>
        )}
        <p className="mt-3 text-sm text-gold-light">
          {price > 0 ? formatIDR(price) : "—"}{" "}
          <span className="text-cream/50">/ night</span>
        </p>

        {availability && (
          <p className="mt-2 text-xs text-emerald-300">
            {availability.availableRooms > 0
              ? `${availability.availableRooms} kamar tersedia`
              : "Tidak tersedia untuk tanggal ini"}
          </p>
        )}

        {datesPicked && !soldOut ? (
          <Link
            href={checkoutHref}
            className="mt-4 block w-full border border-gold bg-gold py-2.5 text-center text-xs tracking-[0.2em] uppercase text-ink transition hover:bg-gold-light"
          >
            Book Now
          </Link>
        ) : (
          <button
            disabled
            className="mt-4 w-full cursor-not-allowed border border-gold/40 bg-gold/10 py-2.5 text-xs tracking-[0.2em] uppercase text-gold-light/50"
            title={
              soldOut ? "Tidak tersedia untuk tanggal ini" : "Pilih tanggal dulu di atas"
            }
          >
            {soldOut ? "Tidak tersedia" : "Pilih tanggal dulu"}
          </button>
        )}
      </div>
    </div>
  );
}
