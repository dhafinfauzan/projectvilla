"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  assignRoom,
  createWalkInBooking,
  logoutAdmin,
  modifyBooking,
  updateBookingStatus,
  updateHousekeepingTask,
  type AdminActionResult,
} from "./actions";

export type AdminBooking = {
  id: string;
  bookingCode: string;
  villaId: string;
  villaName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  email: string;
  phone: string;
  specialRequests: string | null;
  internalNotes: string | null;
  nights: number;
  totalAmount: number;
  currency: string;
  status: string;
  source: string;
  paymentProvider: string | null;
  assignedUnitId: string | null;
  assignedUnitCode: string | null;
  createdAt: string;
};

export type AdminRoomUnit = {
  id: string;
  villaId: string;
  villaName: string;
  code: string;
  floor: string | null;
  operationalStatus: string;
  housekeepingStatus: string;
};

export type AdminVilla = {
  id: string;
  name: string;
  pricePerNight: number;
  maxGuests: number;
  totalUnits: number;
};

export type AdminTask = {
  id: string;
  roomUnitId: string;
  roomCode: string;
  villaName: string;
  businessDate: string;
  taskType: string;
  status: string;
  priority: string;
  assignee: string | null;
  note: string | null;
};

export type AdminSnapshot = {
  generatedAt: string;
  staff: { id: string; name: string; email: string; role: string };
  bookings: AdminBooking[];
  roomUnits: AdminRoomUnit[];
  villas: AdminVilla[];
  tasks: AdminTask[];
};

type Section = "today" | "reservations" | "rooms" | "housekeeping";

const SECTION_META: Record<Section, { eyebrow: string; title: string }> = {
  today: { eyebrow: "Business day", title: "Today at Taru" },
  reservations: { eyebrow: "Front office", title: "Reservations" },
  rooms: { eyebrow: "Live inventory", title: "Room board" },
  housekeeping: { eyebrow: "Room operations", title: "Housekeeping" },
};

const ACTIVE_STATUSES = new Set(["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"]);

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending payment",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "In house",
  CHECKED_OUT: "Checked out",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
  EXPIRED: "Expired",
};

const STATUS_CLASS: Record<string, string> = {
  PENDING_PAYMENT: "border-[#d3a247] bg-[#fff5dc] text-[#76520f]",
  CONFIRMED: "border-[#8eb49b] bg-[#edf7ef] text-[#285d3b]",
  CHECKED_IN: "border-[#7ea8ad] bg-[#e8f3f2] text-[#245b61]",
  CHECKED_OUT: "border-[#b7bbb6] bg-[#f0f1ee] text-[#59605b]",
  CANCELLED: "border-[#d5aaa0] bg-[#fbefec] text-[#8a3d2d]",
  NO_SHOW: "border-[#d5aaa0] bg-[#fbefec] text-[#8a3d2d]",
  EXPIRED: "border-[#c8c5bd] bg-[#f3f1eb] text-[#6c6b65]",
};

const HK_LABELS: Record<string, string> = {
  INSPECTED: "Ready",
  CLEAN: "Review",
  CLEANING: "Cleaning",
  DIRTY: "Dirty",
};

const HK_CLASS: Record<string, string> = {
  INSPECTED: "bg-[#dbeadf] text-[#24583a]",
  CLEAN: "bg-[#e8efe5] text-[#4f674b]",
  CLEANING: "bg-[#fff0ce] text-[#755417]",
  DIRTY: "bg-[#f4ded7] text-[#863c2c]",
};

function localDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(left: string, right: string): boolean {
  return localDay(left) === localDay(right);
}

function formatMoney(amount: number, compact = false): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(amount);
}

function formatDate(value: string, withYear = false): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(value));
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase ${
        STATUS_CLASS[status] ?? STATUS_CLASS.EXPIRED
      }`}
    >
      {STATUS_LABELS[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-[#c8c6bd] bg-white/40 px-6 py-10 text-center">
      <p className="font-medium text-[#263a30]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718078]">{body}</p>
    </div>
  );
}

export default function VillaOSWorkspace({ snapshot }: { snapshot: AdminSnapshot }) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("today");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [roomFilter, setRoomFilter] = useState("ALL");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    snapshot.bookings[0]?.id ?? null
  );
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [walkInVillaId, setWalkInVillaId] = useState(snapshot.villas[0]?.id ?? "");
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const now = useMemo(() => new Date(snapshot.generatedAt), [snapshot.generatedAt]);
  const today = localDay(now);
  const totalRooms = snapshot.roomUnits.length;
  const activeBookings = snapshot.bookings.filter((booking) => ACTIVE_STATUSES.has(booking.status));
  const occupiedNow = activeBookings.filter(
    (booking) =>
      booking.assignedUnitId &&
      new Date(booking.checkIn) <= now &&
      new Date(booking.checkOut) > now
  );
  const arrivals = snapshot.bookings.filter(
    (booking) => isSameDay(booking.checkIn, snapshot.generatedAt) && ACTIVE_STATUSES.has(booking.status)
  );
  const departures = snapshot.bookings.filter(
    (booking) =>
      isSameDay(booking.checkOut, snapshot.generatedAt) &&
      ["CONFIRMED", "CHECKED_IN"].includes(booking.status)
  );
  const pendingPayments = snapshot.bookings.filter((booking) => booking.status === "PENDING_PAYMENT");
  const openTasks = snapshot.tasks.filter((task) => !["INSPECTED"].includes(task.status));
  const occupancy = totalRooms ? Math.round((occupiedNow.length / totalRooms) * 100) : 0;

  const selectedBooking =
    snapshot.bookings.find((booking) => booking.id === selectedBookingId) ?? null;

  const filteredBookings = snapshot.bookings.filter((booking) => {
    const haystack = `${booking.bookingCode} ${booking.guestName} ${booking.email} ${booking.phone} ${booking.villaName} ${booking.assignedUnitCode ?? ""}`.toLowerCase();
    const matchesQuery = haystack.includes(query.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && ACTIVE_STATUSES.has(booking.status)) ||
      booking.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const movement = [
    ...arrivals.map((booking) => ({ type: "arrival" as const, booking })),
    ...departures.map((booking) => ({ type: "departure" as const, booking })),
  ].sort((a, b) => a.booking.guestName.localeCompare(b.booking.guestName));

  const occupancyForecast = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const count = activeBookings.filter(
      (booking) => new Date(booking.checkIn) <= date && new Date(booking.checkOut) > date
    ).length;
    return { date, count, percent: totalRooms ? Math.round((count / totalRooms) * 100) : 0 };
  });

  const notify = (result: AdminActionResult) => {
    setToast(result);
    if (result.ok) router.refresh();
    window.setTimeout(() => setToast(null), 3600);
  };

  const runAction = (action: () => Promise<AdminActionResult>) => {
    startTransition(async () => notify(await action()));
  };

  const nextReservationAction = (booking: AdminBooking) => {
    if (booking.status === "PENDING_PAYMENT") {
      return { label: "Mark paid", status: "CONFIRMED" };
    }
    if (booking.status === "CONFIRMED") {
      return { label: "Check in", status: "CHECKED_IN" };
    }
    if (booking.status === "CHECKED_IN") {
      return { label: "Check out", status: "CHECKED_OUT" };
    }
    return null;
  };

  const navigation: { id: Section; label: string; count?: number }[] = [
    { id: "today", label: "Today", count: arrivals.length + departures.length },
    { id: "reservations", label: "Reservations", count: activeBookings.length },
    { id: "rooms", label: "Room board", count: totalRooms },
    { id: "housekeeping", label: "Housekeeping", count: openTasks.length },
  ];

  const renderToday = () => (
    <div className="space-y-5">
      {(pendingPayments.length > 0 || openTasks.length > 0) && (
        <div className="flex flex-col justify-between gap-3 border border-[#d9c69a] bg-[#fff7df] px-4 py-3 text-sm text-[#5f4a1d] sm:flex-row sm:items-center">
          <p>
            <span className="font-semibold">Shift attention:</span> {pendingPayments.length} pembayaran menunggu dan {openTasks.length} tugas kamar belum selesai.
          </p>
          <button
            onClick={() => setSection(pendingPayments.length ? "reservations" : "housekeeping")}
            className="shrink-0 text-xs font-semibold tracking-[0.12em] uppercase underline decoration-[#9b7c35] underline-offset-4"
          >
            Review queue
          </button>
        </div>
      )}

      <section className="grid overflow-hidden border border-[#d2d0c7] bg-white lg:grid-cols-[1.35fr_0.65fr]">
        <div className="bg-[#162a21] px-6 py-7 text-[#f5f0e5] sm:px-8 sm:py-9">
          <p className="text-[10px] font-semibold tracking-[0.22em] text-[#b8cabd] uppercase">Morning brief · Ubud</p>
          <div className="mt-5 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <h2 className="max-w-xl font-serif text-3xl leading-tight sm:text-4xl">
                {arrivals.length + departures.length === 0
                  ? "A quiet board. Keep the rooms ready."
                  : `${arrivals.length} arrival${arrivals.length === 1 ? "" : "s"}, ${departures.length} departure${departures.length === 1 ? "" : "s"}.`}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#b8c5bd]">
                {occupiedNow.length} unit sedang ditempati. Prioritas shift: selesaikan room turnaround sebelum tamu berikutnya tiba.
              </p>
            </div>
            <div className="min-w-32 border-l border-white/20 pl-5">
              <p className="font-serif text-5xl">{occupancy}%</p>
              <p className="mt-1 text-[10px] tracking-[0.16em] text-[#b8c5bd] uppercase">Occupied now</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 bg-[#eee8da]">
          <div className="border-b border-r border-[#d2ccbe] p-5">
            <p className="text-[10px] tracking-[0.16em] text-[#6f786f] uppercase">Arrivals</p>
            <p className="mt-2 font-serif text-3xl text-[#1b3025]">{arrivals.length}</p>
          </div>
          <div className="border-b border-[#d2ccbe] p-5">
            <p className="text-[10px] tracking-[0.16em] text-[#6f786f] uppercase">Departures</p>
            <p className="mt-2 font-serif text-3xl text-[#1b3025]">{departures.length}</p>
          </div>
          <div className="border-r border-[#d2ccbe] p-5">
            <p className="text-[10px] tracking-[0.16em] text-[#6f786f] uppercase">Ready rooms</p>
            <p className="mt-2 font-serif text-3xl text-[#1b3025]">
              {snapshot.roomUnits.filter((room) => room.housekeepingStatus === "INSPECTED").length}
            </p>
          </div>
          <div className="p-5">
            <p className="text-[10px] tracking-[0.16em] text-[#6f786f] uppercase">Pending</p>
            <p className="mt-2 font-serif text-2xl text-[#1b3025]">
              {formatMoney(pendingPayments.reduce((sum, item) => sum + item.totalAmount, 0), true)}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
        <section className="border border-[#d2d0c7] bg-white">
          <div className="flex items-center justify-between border-b border-[#dedcd4] px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-[#79837c] uppercase">Live movement</p>
              <h3 className="mt-1 font-serif text-xl">Arrivals & departures</h3>
            </div>
            <button onClick={() => setSection("reservations")} className="text-xs font-semibold text-[#315b45]">View all →</button>
          </div>
          {movement.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No movement today" body="Future reservations remain visible in the reservation desk." />
            </div>
          ) : (
            <div className="divide-y divide-[#e5e3dc]">
              {movement.map(({ type, booking }) => {
                const next = nextReservationAction(booking);
                return (
                  <div key={`${type}-${booking.id}`} className="grid gap-4 px-5 py-4 sm:grid-cols-[82px_1fr_auto] sm:items-center">
                    <div>
                      <p className="text-[10px] font-semibold tracking-[0.14em] text-[#79837c] uppercase">{type}</p>
                      <p className="mt-1 font-mono text-xs text-[#37483f]">{type === "arrival" ? "14:00" : "11:00"}</p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{booking.guestName}</p>
                        <StatusPill status={booking.status} />
                      </div>
                      <p className="mt-1 text-xs text-[#738078]">
                        {booking.assignedUnitCode ?? "Unassigned"} · {booking.villaName} · {booking.guests} guests
                      </p>
                    </div>
                    {next && (
                      <button
                        disabled={isPending}
                        onClick={() => runAction(() => updateBookingStatus({ bookingId: booking.id, nextStatus: next.status }))}
                        className="h-9 border border-[#234c38] px-3 text-[10px] font-semibold tracking-[0.12em] text-[#234c38] uppercase transition hover:bg-[#234c38] hover:text-white disabled:opacity-40"
                      >
                        {next.label}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="border border-[#d2d0c7] bg-white p-5">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-[#79837c] uppercase">Next 7 days</p>
            <h3 className="mt-1 font-serif text-xl">Occupancy pace</h3>
            <div className="mt-5 space-y-3">
              {occupancyForecast.map((item, index) => (
                <div key={item.date.toISOString()} className="grid grid-cols-[42px_1fr_38px] items-center gap-3">
                  <span className="text-xs text-[#67746c]">
                    {index === 0 ? "Today" : new Intl.DateTimeFormat("en", { weekday: "short" }).format(item.date)}
                  </span>
                  <div className="h-2 bg-[#ebe8e0]">
                    <div className="h-full bg-[#3c7054]" style={{ width: `${Math.max(item.percent, item.count ? 8 : 0)}%` }} />
                  </div>
                  <span className="text-right font-mono text-xs">{item.percent}%</span>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-[#d2d0c7] bg-white">
            <div className="border-b border-[#dedcd4] px-5 py-4">
              <p className="text-[10px] font-semibold tracking-[0.18em] text-[#79837c] uppercase">Room pulse</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-[#e5e3dc]">
              {["INSPECTED", "CLEAN", "CLEANING", "DIRTY"].map((status) => (
                <button key={status} onClick={() => { setRoomFilter(status); setSection("rooms"); }} className="p-4 text-left transition hover:bg-[#f7f5ef]">
                  <p className="font-serif text-2xl">{snapshot.roomUnits.filter((room) => room.housekeepingStatus === status).length}</p>
                  <p className="mt-1 text-[10px] tracking-[0.12em] text-[#6f7a72] uppercase">{HK_LABELS[status]}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  const renderReservations = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 border border-[#d2d0c7] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#dedcd4] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <label htmlFor="reservation-search" className="sr-only">Search reservations</label>
            <input
              id="reservation-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, guest, phone or room…"
              className="h-10 w-full border border-[#cbc9c0] bg-[#faf9f5] px-3 text-sm outline-none transition placeholder:text-[#9da39e] focus:border-[#315b45]"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {["ACTIVE", "ALL", "PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`h-9 whitespace-nowrap border px-3 text-[10px] font-semibold tracking-[0.08em] uppercase ${
                  statusFilter === status
                    ? "border-[#203f30] bg-[#203f30] text-white"
                    : "border-[#d2d0c7] text-[#647068] hover:border-[#8c978f]"
                }`}
              >
                {status === "PENDING_PAYMENT" ? "Pending" : status.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-[#f3f1eb] text-[10px] tracking-[0.12em] text-[#758078] uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Guest</th>
                <th className="px-4 py-3 font-semibold">Stay</th>
                <th className="px-4 py-3 font-semibold">Room</th>
                <th className="px-4 py-3 font-semibold">Value</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e3dc]">
              {filteredBookings.map((booking) => (
                <tr key={booking.id} className={selectedBookingId === booking.id ? "bg-[#f4f7f3]" : "hover:bg-[#faf9f5]"}>
                  <td className="px-4 py-4">
                    <button onClick={() => setSelectedBookingId(booking.id)} className="text-left">
                      <p className="font-medium text-[#172b21]">{booking.guestName}</p>
                      <p className="mt-1 font-mono text-[10px] tracking-[0.05em] text-[#78837b]">{booking.bookingCode}</p>
                    </button>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <p>{formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}</p>
                    <p className="mt-1 text-xs text-[#7a847d]">{booking.nights} nights · {booking.guests} guests</p>
                  </td>
                  <td className="px-4 py-4">
                    <p>{booking.assignedUnitCode ?? "Unassigned"}</p>
                    <p className="mt-1 max-w-40 truncate text-xs text-[#7a847d]">{booking.villaName}</p>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap font-medium">{formatMoney(booking.totalAmount)}</td>
                  <td className="px-4 py-4"><StatusPill status={booking.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredBookings.length === 0 && (
          <div className="p-5"><EmptyState title="No matching reservations" body="Try a broader search or change the status filter." /></div>
        )}
      </section>

      <aside className="border border-[#d2d0c7] bg-white xl:sticky xl:top-24 xl:self-start">
        {selectedBooking ? (
          <>
            <div className="border-b border-[#dedcd4] bg-[#172b21] p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.1em] text-[#b8c7be]">{selectedBooking.bookingCode}</p>
                  <h3 className="mt-2 font-serif text-2xl">{selectedBooking.guestName}</h3>
                </div>
                <StatusPill status={selectedBooking.status} />
              </div>
              <p className="mt-4 text-sm text-[#c7d2cb]">{selectedBooking.email}<br />{selectedBooking.phone}</p>
            </div>
            <div className="space-y-5 p-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                <div><dt className="text-[10px] tracking-[0.1em] text-[#7a847d] uppercase">Stay</dt><dd className="mt-1">{formatDate(selectedBooking.checkIn, true)}<br />{formatDate(selectedBooking.checkOut, true)}</dd></div>
                <div><dt className="text-[10px] tracking-[0.1em] text-[#7a847d] uppercase">Room</dt><dd className="mt-1">{selectedBooking.assignedUnitCode ?? "Not assigned"}<br /><span className="text-xs text-[#7a847d]">{selectedBooking.villaName}</span></dd></div>
                <div><dt className="text-[10px] tracking-[0.1em] text-[#7a847d] uppercase">Source</dt><dd className="mt-1">{selectedBooking.source.replaceAll("_", " ")}</dd></div>
                <div><dt className="text-[10px] tracking-[0.1em] text-[#7a847d] uppercase">Value</dt><dd className="mt-1 font-medium">{formatMoney(selectedBooking.totalAmount)}</dd></div>
              </dl>

              {!selectedBooking.assignedUnitId && ["CONFIRMED", "PENDING_PAYMENT"].includes(selectedBooking.status) && (
                <div>
                  <label htmlFor="unit-assignment" className="text-[10px] tracking-[0.1em] text-[#7a847d] uppercase">Assign a room</label>
                  <select
                    id="unit-assignment"
                    defaultValue=""
                    onChange={(event) => event.target.value && runAction(() => assignRoom({ bookingId: selectedBooking.id, roomUnitId: event.target.value }))}
                    className="mt-2 h-10 w-full border border-[#cbc9c0] bg-white px-3 text-sm"
                  >
                    <option value="">Select available unit…</option>
                    {snapshot.roomUnits.filter((room) => room.villaId === selectedBooking.villaId && room.operationalStatus === "SELLABLE").map((room) => (
                      <option key={room.id} value={room.id}>{room.code} · {HK_LABELS[room.housekeepingStatus]}</option>
                    ))}
                  </select>
                </div>
              )}

              {(selectedBooking.specialRequests || selectedBooking.internalNotes) && (
                <div className="border-l-2 border-[#c2a565] bg-[#faf6ea] px-4 py-3 text-sm leading-6 text-[#5d5544]">
                  {selectedBooking.specialRequests || selectedBooking.internalNotes}
                </div>
              )}

              {nextReservationAction(selectedBooking) && (
                <button
                  disabled={isPending}
                  onClick={() => {
                    const next = nextReservationAction(selectedBooking);
                    if (next) runAction(() => updateBookingStatus({ bookingId: selectedBooking.id, nextStatus: next.status }));
                  }}
                  className="h-11 w-full bg-[#244c38] text-xs font-semibold tracking-[0.14em] text-white uppercase transition hover:bg-[#193729] disabled:opacity-50"
                >
                  {nextReservationAction(selectedBooking)?.label}
                </button>
              )}

              {["PENDING_PAYMENT", "CONFIRMED"].includes(selectedBooking.status) && (
                <details className="border border-[#d5d2c9] bg-[#f8f7f2]">
                  <summary className="cursor-pointer px-4 py-3 text-[10px] font-semibold tracking-[0.11em] text-[#315b45] uppercase">Modify stay & guest</summary>
                  <form
                    className="grid gap-3 border-t border-[#dedbd2] p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      runAction(() => modifyBooking({
                        bookingId: selectedBooking.id,
                        checkIn: String(form.get("checkIn")),
                        checkOut: String(form.get("checkOut")),
                        guests: Number(form.get("guests")),
                        guestName: String(form.get("guestName")),
                        phone: String(form.get("phone")),
                        internalNotes: String(form.get("internalNotes") ?? ""),
                      }));
                    }}
                  >
                    <div className="grid grid-cols-2 gap-2"><input name="checkIn" type="date" defaultValue={localDay(selectedBooking.checkIn)} required className="h-10 border border-[#c9c7be] bg-white px-2 text-xs" /><input name="checkOut" type="date" defaultValue={localDay(selectedBooking.checkOut)} required className="h-10 border border-[#c9c7be] bg-white px-2 text-xs" /></div>
                    <input name="guestName" defaultValue={selectedBooking.guestName} required className="h-10 border border-[#c9c7be] bg-white px-2 text-xs" />
                    <div className="grid grid-cols-[90px_1fr] gap-2"><input name="guests" type="number" min="1" defaultValue={selectedBooking.guests} required className="h-10 border border-[#c9c7be] bg-white px-2 text-xs" /><input name="phone" defaultValue={selectedBooking.phone} required className="h-10 border border-[#c9c7be] bg-white px-2 text-xs" /></div>
                    <input name="internalNotes" defaultValue={selectedBooking.internalNotes ?? ""} placeholder="Internal note" className="h-10 border border-[#c9c7be] bg-white px-2 text-xs" />
                    <button disabled={isPending} className="h-10 bg-[#244c38] text-[10px] font-semibold tracking-[0.11em] text-white uppercase disabled:opacity-45">Reprice & save</button>
                  </form>
                </details>
              )}

              {["PENDING_PAYMENT", "CONFIRMED"].includes(selectedBooking.status) && (
                <button
                  disabled={isPending}
                  onClick={() => runAction(() => updateBookingStatus({ bookingId: selectedBooking.id, nextStatus: "CANCELLED" }))}
                  className="h-10 w-full border border-[#d1aaa1] text-xs font-semibold tracking-[0.12em] text-[#8a3d2d] uppercase transition hover:bg-[#fbefec] disabled:opacity-50"
                >
                  Cancel reservation
                </button>
              )}
              {selectedBooking.status === "CONFIRMED" && (
                <button disabled={isPending} onClick={() => runAction(() => updateBookingStatus({ bookingId: selectedBooking.id, nextStatus: "NO_SHOW" }))} className="h-10 w-full border border-[#c9b78d] text-xs font-semibold tracking-[0.12em] text-[#765b20] uppercase transition hover:bg-[#fff8e7] disabled:opacity-50">Mark no-show</button>
              )}
            </div>
          </>
        ) : (
          <div className="p-5"><EmptyState title="Select a reservation" body="Guest, stay, room and status actions will appear here." /></div>
        )}
      </aside>
    </div>
  );

  const renderRooms = () => {
    const filtered = snapshot.roomUnits.filter((room) => roomFilter === "ALL" || room.housekeepingStatus === roomFilter);
    return (
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-4 border border-[#d2d0c7] bg-white px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium">{totalRooms} physical units</p>
            <p className="mt-1 text-xs text-[#77827a]">Occupancy and cleanliness are tracked separately.</p>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {["ALL", "INSPECTED", "CLEAN", "CLEANING", "DIRTY"].map((status) => (
              <button key={status} onClick={() => setRoomFilter(status)} className={`h-9 whitespace-nowrap border px-3 text-[10px] font-semibold tracking-[0.08em] uppercase ${roomFilter === status ? "border-[#203f30] bg-[#203f30] text-white" : "border-[#d2d0c7] text-[#647068]"}`}>
                {status === "ALL" ? "All rooms" : HK_LABELS[status]}
              </button>
            ))}
          </div>
        </div>

        {snapshot.villas.map((villa) => {
          const rooms = filtered.filter((room) => room.villaId === villa.id);
          if (!rooms.length) return null;
          return (
            <section key={villa.id} className="border border-[#d2d0c7] bg-white">
              <div className="flex items-end justify-between border-b border-[#dedcd4] px-5 py-4">
                <div><p className="text-[10px] tracking-[0.14em] text-[#768178] uppercase">Room type</p><h3 className="mt-1 font-serif text-xl">{villa.name}</h3></div>
                <p className="text-xs text-[#768178]">{villa.totalUnits} units · {formatMoney(villa.pricePerNight)} / night</p>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {rooms.map((room) => {
                  const current = activeBookings.find((booking) => booking.assignedUnitId === room.id && new Date(booking.checkIn) <= now && new Date(booking.checkOut) > now);
                  const next = activeBookings.filter((booking) => booking.assignedUnitId === room.id && new Date(booking.checkIn) > now).sort((a, b) => +new Date(a.checkIn) - +new Date(b.checkIn))[0];
                  return (
                    <article key={room.id} className="min-h-44 border-b border-r border-[#e3e1da] p-5">
                      <div className="flex items-start justify-between">
                        <div><p className="font-mono text-lg font-semibold tracking-[0.04em]">{room.code}</p><p className="mt-1 text-xs text-[#7b857e]">{room.floor}</p></div>
                        <span className={`px-2 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase ${HK_CLASS[room.housekeepingStatus] ?? HK_CLASS.CLEAN}`}>{HK_LABELS[room.housekeepingStatus] ?? room.housekeepingStatus}</span>
                      </div>
                      <div className="mt-6 border-t border-[#e5e3dc] pt-3">
                        {current ? (
                          <><p className="text-[10px] tracking-[0.12em] text-[#6f7b73] uppercase">In house</p><p className="mt-1 truncate text-sm font-medium">{current.guestName}</p><p className="mt-1 text-xs text-[#7b857e]">Until {formatDate(current.checkOut)}</p></>
                        ) : next ? (
                          <><p className="text-[10px] tracking-[0.12em] text-[#6f7b73] uppercase">Next arrival</p><p className="mt-1 truncate text-sm font-medium">{next.guestName}</p><p className="mt-1 text-xs text-[#7b857e]">{formatDate(next.checkIn)}</p></>
                        ) : (
                          <><p className="text-[10px] tracking-[0.12em] text-[#6f7b73] uppercase">Availability</p><p className="mt-1 text-sm font-medium text-[#315b45]">Open inventory</p><p className="mt-1 text-xs text-[#7b857e]">No upcoming assignment</p></>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderHousekeeping = () => {
    const columns = [
      { id: "OPEN", label: "To do", hint: "Queued for this shift" },
      { id: "IN_PROGRESS", label: "In progress", hint: "Rooms being serviced" },
      { id: "REVIEW", label: "Review", hint: "Clean or inspected" },
    ];
    return (
      <div className="grid gap-4 xl:grid-cols-3">
        {columns.map((column) => {
          const tasks = snapshot.tasks.filter((task) =>
            column.id === "REVIEW" ? ["DONE", "INSPECTED"].includes(task.status) : task.status === column.id
          );
          return (
            <section key={column.id} className="border border-[#d2d0c7] bg-[#ebe9e2]">
              <div className="flex items-end justify-between border-b border-[#d2d0c7] bg-white px-4 py-4">
                <div><h3 className="font-serif text-xl">{column.label}</h3><p className="mt-1 text-xs text-[#7b857e]">{column.hint}</p></div>
                <span className="font-mono text-sm">{tasks.length}</span>
              </div>
              <div className="space-y-3 p-3">
                {tasks.map((task) => (
                  <article key={task.id} className="border border-[#d5d2c9] bg-white p-4 shadow-[0_1px_0_rgba(20,35,27,0.03)]">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-mono text-lg font-semibold">{task.roomCode}</p><p className="mt-1 text-[10px] tracking-[0.1em] text-[#7b857e] uppercase">{task.taskType.replaceAll("_", " ")}</p></div>
                      <span className={`border px-2 py-1 text-[9px] font-semibold tracking-[0.1em] uppercase ${task.priority === "HIGH" ? "border-[#d3a193] bg-[#f9e9e4] text-[#8b3e2c]" : "border-[#c8c8bf] text-[#6c726d]"}`}>{task.priority}</span>
                    </div>
                    <p className="mt-4 text-sm leading-5 text-[#526158]">{task.note ?? "Standard room checklist."}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-[#e5e3dc] pt-3">
                      <span className="text-xs text-[#77827a]">{task.assignee ?? "Unassigned"}</span>
                      {task.status === "OPEN" && <button disabled={isPending} onClick={() => runAction(() => updateHousekeepingTask({ taskId: task.id, nextStatus: "IN_PROGRESS" }))} className="text-[10px] font-semibold tracking-[0.1em] text-[#315b45] uppercase">Start →</button>}
                      {task.status === "IN_PROGRESS" && <button disabled={isPending} onClick={() => runAction(() => updateHousekeepingTask({ taskId: task.id, nextStatus: "DONE" }))} className="text-[10px] font-semibold tracking-[0.1em] text-[#315b45] uppercase">Mark clean →</button>}
                      {task.status === "DONE" && <button disabled={isPending} onClick={() => runAction(() => updateHousekeepingTask({ taskId: task.id, nextStatus: "INSPECTED" }))} className="text-[10px] font-semibold tracking-[0.1em] text-[#315b45] uppercase">Inspect →</button>}
                      {task.status === "INSPECTED" && <span className="text-[10px] font-semibold tracking-[0.1em] text-[#315b45] uppercase">Ready</span>}
                    </div>
                  </article>
                ))}
                {tasks.length === 0 && <div className="border border-dashed border-[#c8c6bd] bg-white/50 px-4 py-8 text-center text-xs leading-5 text-[#7b857e]">No tasks in this lane.</div>}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const submitWalkIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createWalkInBooking({
        guestName: String(form.get("guestName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        villaId: String(form.get("villaId") ?? ""),
        roomUnitId: String(form.get("roomUnitId") ?? ""),
        checkIn: String(form.get("checkIn") ?? ""),
        checkOut: String(form.get("checkOut") ?? ""),
        guests: Number(form.get("guests") ?? 1),
        notes: String(form.get("notes") ?? ""),
      });
      notify(result);
      if (result.ok) setShowNewBooking(false);
    });
  };

  return (
    <div className="min-h-svh bg-[#f3f1eb] text-[#172b21]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col bg-[#13271e] text-[#f5f0e5] lg:flex">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center border border-[#9db3a4] font-serif text-lg">V</span>
            <div><p className="font-serif text-xl leading-none">VillaOS</p><p className="mt-1 text-[9px] tracking-[0.2em] text-[#9fb2a6] uppercase">Property system</p></div>
          </div>
        </div>
        <div className="px-4 py-5">
          <p className="px-2 text-[9px] font-semibold tracking-[0.2em] text-[#7f9788] uppercase">Operate</p>
          <nav className="mt-3 space-y-1" aria-label="VillaOS sections">
            {navigation.map((item, index) => (
              <button key={item.id} onClick={() => setSection(item.id)} className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition ${section === item.id ? "bg-[#294738] text-white" : "text-[#bdc9c1] hover:bg-white/5 hover:text-white"}`}>
                <span className={`grid size-5 place-items-center border text-[9px] ${section === item.id ? "border-[#97ad9f]" : "border-[#4a6254]"}`}>{String(index + 1).padStart(2, "0")}</span>
                <span className="flex-1">{item.label}</span>
                {item.count !== undefined && <span className="font-mono text-[10px] text-[#8fa396]">{item.count}</span>}
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto border-t border-white/10 p-4">
          <Link href="/admin/control" className="mb-3 flex w-full items-center justify-between border border-[#6b8274] bg-[#294738] px-3 py-3 text-[10px] font-semibold tracking-[0.12em] text-white uppercase transition hover:bg-[#355845]">
            <span>Control center</span><span>→</span>
          </Link>
          <div className="border border-white/10 bg-white/5 p-4">
            <p className="text-[9px] tracking-[0.16em] text-[#82998b] uppercase">Active property</p>
            <p className="mt-2 text-sm font-medium">The Taru Villas</p>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-[#aebdb3]"><span className="size-1.5 bg-[#86bf91]" /> Ubud · GMT+8 · Online</div>
            <p className="mt-3 truncate text-[10px] text-[#8fa396]">{snapshot.staff.name} · {snapshot.staff.role.replaceAll("_", " ")}</p>
          </div>
          <form action={logoutAdmin} className="mt-3">
            <button className="w-full px-3 py-2 text-left text-[10px] tracking-[0.14em] text-[#82998b] uppercase hover:text-white">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-[252px]">
        <div className="sticky top-0 z-20 border-b border-[#d7d5cc] bg-[#f3f1eb]/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-8">
            <div className="flex items-center gap-4">
              <div className="lg:hidden"><p className="font-serif text-xl">VillaOS</p></div>
              <div className="hidden h-8 w-px bg-[#d1cec4] lg:block" />
              <div>
                <p className="text-[9px] font-semibold tracking-[0.18em] text-[#7d877f] uppercase">{SECTION_META[section].eyebrow}</p>
                <h1 className="mt-0.5 font-serif text-xl leading-none sm:text-2xl">{SECTION_META[section].title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden text-right sm:block"><p className="text-xs font-medium">{new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(now)}</p><p className="mt-1 text-[9px] tracking-[0.12em] text-[#7b857e] uppercase">Business day open</p></div>
              <button onClick={() => setShowNewBooking(true)} className="h-10 bg-[#244c38] px-4 text-[10px] font-semibold tracking-[0.14em] text-white uppercase transition hover:bg-[#193729] sm:px-5">+ New booking</button>
            </div>
          </div>
          <nav className="flex overflow-x-auto border-t border-[#dedbd2] px-3 lg:hidden" aria-label="Mobile VillaOS sections">
            {navigation.map((item) => <button key={item.id} onClick={() => setSection(item.id)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs ${section === item.id ? "border-[#244c38] font-semibold text-[#244c38]" : "border-transparent text-[#77827a]"}`}>{item.label}</button>)}
          </nav>
        </div>

        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {section === "today" && renderToday()}
          {section === "reservations" && renderReservations()}
          {section === "rooms" && renderRooms()}
          {section === "housekeeping" && renderHousekeeping()}
        </div>
      </div>

      {showNewBooking && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-[#102219]/45 p-0 sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="walkin-title">
          <div className="max-h-svh w-full overflow-y-auto bg-[#f7f5ef] shadow-2xl sm:max-w-2xl sm:border sm:border-[#d4d1c7]">
            <div className="flex items-start justify-between border-b border-[#d7d4cb] bg-[#172b21] px-5 py-5 text-white sm:px-7">
              <div><p className="text-[9px] tracking-[0.18em] text-[#a9b9ae] uppercase">Front desk</p><h2 id="walkin-title" className="mt-1 font-serif text-2xl">Create a walk-in</h2></div>
              <button onClick={() => setShowNewBooking(false)} className="grid size-9 place-items-center border border-white/20 text-lg" aria-label="Close">×</button>
            </div>
            <form onSubmit={submitWalkIn} className="grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
              <label className="text-xs font-medium">Guest name<input name="guestName" required className="mt-2 h-11 w-full border border-[#c9c7be] bg-white px-3 text-sm outline-none focus:border-[#315b45]" placeholder="Full name" /></label>
              <label className="text-xs font-medium">Phone<input name="phone" required className="mt-2 h-11 w-full border border-[#c9c7be] bg-white px-3 text-sm outline-none focus:border-[#315b45]" placeholder="+62…" /></label>
              <label className="text-xs font-medium sm:col-span-2">Email <span className="font-normal text-[#869089]">(optional)</span><input name="email" type="email" className="mt-2 h-11 w-full border border-[#c9c7be] bg-white px-3 text-sm outline-none focus:border-[#315b45]" placeholder="guest@example.com" /></label>
              <label className="text-xs font-medium">Villa type<select name="villaId" value={walkInVillaId} onChange={(event) => setWalkInVillaId(event.target.value)} className="mt-2 h-11 w-full border border-[#c9c7be] bg-white px-3 text-sm">{snapshot.villas.map((villa) => <option key={villa.id} value={villa.id}>{villa.name}</option>)}</select></label>
              <label className="text-xs font-medium">Room unit<select name="roomUnitId" required className="mt-2 h-11 w-full border border-[#c9c7be] bg-white px-3 text-sm"><option value="">Select unit…</option>{snapshot.roomUnits.filter((room) => room.villaId === walkInVillaId && room.operationalStatus === "SELLABLE").map((room) => <option key={room.id} value={room.id}>{room.code} · {HK_LABELS[room.housekeepingStatus]}</option>)}</select></label>
              <label className="text-xs font-medium">Check-in<input name="checkIn" type="date" min={today} defaultValue={today} required className="mt-2 h-11 w-full border border-[#c9c7be] bg-white px-3 text-sm" /></label>
              <label className="text-xs font-medium">Check-out<input name="checkOut" type="date" min={today} defaultValue={localDay(new Date(now.getTime() + 86400000))} required className="mt-2 h-11 w-full border border-[#c9c7be] bg-white px-3 text-sm" /></label>
              <label className="text-xs font-medium">Guests<input name="guests" type="number" min="1" defaultValue="2" required className="mt-2 h-11 w-full border border-[#c9c7be] bg-white px-3 text-sm" /></label>
              <label className="text-xs font-medium">Internal note<input name="notes" className="mt-2 h-11 w-full border border-[#c9c7be] bg-white px-3 text-sm" placeholder="Arrival detail, preference…" /></label>
              <div className="border-t border-[#d7d4cb] pt-5 sm:col-span-2">
                <p className="text-xs leading-5 text-[#6f7a72]">Price is calculated from the stored room rate. The reservation is recorded as confirmed with manual payment at property.</p>
                <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShowNewBooking(false)} className="h-11 border border-[#c9c7be] px-5 text-[10px] font-semibold tracking-[0.12em] uppercase">Cancel</button><button disabled={isPending} className="h-11 bg-[#244c38] px-6 text-[10px] font-semibold tracking-[0.12em] text-white uppercase disabled:opacity-50">{isPending ? "Creating…" : "Create reservation"}</button></div>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`fixed bottom-5 right-5 z-[60] max-w-sm border px-4 py-3 text-sm shadow-xl ${toast.ok ? "border-[#7aa188] bg-[#e8f3eb] text-[#285d3b]" : "border-[#d3a296] bg-[#faebe7] text-[#853e2f]"}`}>{toast.message}</div>}
      {isPending && <div className="fixed inset-x-0 top-0 z-[70] h-0.5 animate-pulse bg-[#c19a5b]" />}
    </div>
  );
}
