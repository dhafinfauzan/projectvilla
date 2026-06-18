"use client";

import { useEffect, useState } from "react";
import { formatIDR } from "@/lib/format";

/**
 * QloApps integration demo page.
 *
 * Proves the three middleware routes end-to-end:
 *   /api/room-types        — list room types + images
 *   /api/check-availability — availability & pricing for a date range
 *   /api/submit-booking     — create a pending booking in QloApps
 *
 * Once the live QloApps backend is confirmed working, this flow can be merged
 * into the main /booking experience.
 */

type RoomType = {
  id: number;
  name: string;
  description: string;
  pricePerNight: number;
  images: string[];
};

type Availability = {
  id: number;
  name: string;
  totalPrice: number;
  pricePerNight: number;
  availableRooms: number;
};

const today = new Date().toISOString().slice(0, 10);

export default function RoomsPage() {
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [checking, setChecking] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability[] | null>(null);

  useEffect(() => {
    fetch("/api/room-types")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Gagal memuat kamar");
        return data;
      })
      .then((data) => setRooms(data.roomTypes ?? []))
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="min-h-svh bg-ink px-5 pb-24 pt-32 text-cream md:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs tracking-[0.3em] uppercase text-gold-light">
          Powered by QloApps
        </p>
        <h1 className="mt-2 font-serif text-3xl md:text-5xl">Our Rooms</h1>

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
            <p className="font-semibold">Gagal memuat data kamar dari QloApps:</p>
            <p className="mt-2">{loadError}</p>
          </div>
        ) : rooms.length === 0 ? (
          <p className="mt-12 text-center text-cream/50">
            Belum ada room type di QloApps.
          </p>
        ) : (
          <div className="mt-12 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                availability={availabilityFor(room.id)}
                booking={{ dateFrom, dateTo }}
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
  booking,
}: {
  room: RoomType;
  availability: Availability | null;
  booking: { dateFrom: string; dateTo: string };
}) {
  const [showForm, setShowForm] = useState(false);
  const price = availability?.pricePerNight || room.pricePerNight;

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
              ? `${availability.availableRooms} kamar tersedia · total ${formatIDR(
                  availability.totalPrice
                )}`
              : "Tidak tersedia untuk tanggal ini"}
          </p>
        )}

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            disabled={!booking.dateFrom || !booking.dateTo}
            className="mt-4 w-full border border-gold bg-gold py-2.5 text-xs tracking-[0.2em] uppercase text-ink transition enabled:hover:bg-gold-light disabled:opacity-40"
            title={!booking.dateFrom ? "Pilih tanggal dulu di atas" : undefined}
          >
            Book Now
          </button>
        ) : (
          <BookingForm
            room={room}
            booking={booking}
            totalPrice={availability?.totalPrice ?? 0}
            onCancel={() => setShowForm(false)}
          />
        )}
      </div>
    </div>
  );
}

function BookingForm({
  room,
  booking,
  totalPrice,
  onCancel,
}: {
  room: RoomType;
  booking: { dateFrom: string; dateTo: string };
  totalPrice: number;
  onCancel: () => void;
}) {
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submit-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstname,
          lastname,
          email,
          phone,
          id_room_type: room.id,
          checkin_date: booking.dateFrom,
          checkout_date: booking.dateTo,
          total_price: totalPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat booking");
      setResult({ id: data.bookingId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mt-4 border border-emerald-400/40 bg-emerald-400/10 p-4 text-center text-sm text-emerald-200">
        ✓ Booking dibuat. ID #{result.id}
        <p className="mt-1 text-xs text-emerald-300/80">
          Status: pending — pembayaran diproses manual oleh staff.
        </p>
      </div>
    );
  }

  const valid =
    firstname.trim() &&
    lastname.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    phone.trim().length > 5;

  return (
    <div className="mt-4 space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <input
          placeholder="First name"
          value={firstname}
          onChange={(e) => setFirstname(e.target.value)}
          className="border border-cream/25 bg-transparent px-3 py-2 text-sm outline-none focus:border-gold"
        />
        <input
          placeholder="Last name"
          value={lastname}
          onChange={(e) => setLastname(e.target.value)}
          className="border border-cream/25 bg-transparent px-3 py-2 text-sm outline-none focus:border-gold"
        />
      </div>
      <input
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border border-cream/25 bg-transparent px-3 py-2 text-sm outline-none focus:border-gold"
      />
      <input
        placeholder="Phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full border border-cream/25 bg-transparent px-3 py-2 text-sm outline-none focus:border-gold"
      />

      {error && <p className="text-xs text-red-300">{error}</p>}

      <div className="flex gap-2.5 pt-1">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="border border-cream/25 px-4 py-2 text-xs tracking-[0.2em] uppercase text-cream/70"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!valid || submitting}
          className="flex-1 border border-gold bg-gold py-2 text-xs tracking-[0.2em] uppercase text-ink transition enabled:hover:bg-gold-light disabled:opacity-40"
        >
          {submitting ? "Submitting…" : "Confirm booking"}
        </button>
      </div>
    </div>
  );
}
