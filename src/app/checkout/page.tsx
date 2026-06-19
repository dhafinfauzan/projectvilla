"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatIDR } from "@/lib/format";
import QrisPayment from "@/components/QrisPayment";

/**
 * Dedicated checkout/payment page. Receives the chosen room + dates from
 * /rooms, confirms price/availability with QloApps, collects guest details and
 * a payment method, then creates the booking and shows the QRIS to pay.
 */

type PaymentMethod = "QRIS" | "VA" | "EWALLET" | "CARD";

const METHODS: {
  id: PaymentMethod;
  label: string;
  desc: string;
  enabled: boolean;
}[] = [
  { id: "QRIS", label: "QRIS", desc: "GoPay, OVO, DANA, ShopeePay, m-banking", enabled: true },
  { id: "VA", label: "Virtual Account", desc: "Transfer bank — segera hadir", enabled: false },
  { id: "EWALLET", label: "E-Wallet", desc: "OVO / DANA / ShopeePay — segera hadir", enabled: false },
  { id: "CARD", label: "Kartu Kredit/Debit", desc: "Visa / Mastercard — segera hadir", enabled: false },
];

type Avail = { totalPrice: number; pricePerNight: number; availableRooms: number };

function nights(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-ink text-cream/50">
          Memuat…
        </div>
      }
    >
      <Checkout />
    </Suspense>
  );
}

function Checkout() {
  const params = useSearchParams();
  const roomType = Number(params.get("roomType"));
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const adults = Number(params.get("adults") ?? 2);
  const children = Number(params.get("children") ?? 0);
  const roomName = params.get("name") ?? "Kamar";
  const n = nights(from, to);
  const incomplete = !roomType || !from || !to;

  const [avail, setAvail] = useState<Avail | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(!incomplete);
  const [availError, setAvailError] = useState<string | null>(null);

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("QRIS");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    id: string | number;
    qrString?: string;
    paymentRequestId?: string;
    paymentMethodId?: string | null;
    amount?: number;
    expiresAt?: string | null;
    testMode?: boolean;
    qrError?: string;
  } | null>(null);

  // Confirm price + availability for the chosen room and dates.
  useEffect(() => {
    if (incomplete) return;
    let active = true;
    fetch("/api/check-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date_from: from, date_to: to, adults, children }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Gagal cek ketersediaan");
        return data;
      })
      .then((data) => {
        if (!active) return;
        const match = (data.roomTypes ?? []).find(
          (rt: { id: number }) => rt.id === roomType
        );
        setAvail(match ?? null);
      })
      .catch((e) => active && setAvailError(e.message))
      .finally(() => active && setLoadingAvail(false));
    return () => {
      active = false;
    };
  }, [roomType, from, to, adults, children, incomplete]);

  const total = avail?.totalPrice ?? 0;
  const soldOut = avail != null && avail.availableRooms === 0;
  const formValid =
    firstname.trim() &&
    lastname.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    phone.trim().length > 5;
  const canSubmit =
    method === "QRIS" && formValid && total > 0 && !soldOut && !submitting;

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
          id_room_type: roomType,
          checkin_date: from,
          checkout_date: to,
          adults,
          children,
          total_price: total,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat booking");
      setResult({
        id: data.bookingId,
        qrString: data.qrString,
        paymentRequestId: data.paymentRequestId,
        paymentMethodId: data.paymentMethodId,
        amount: data.amount,
        expiresAt: data.expiresAt,
        testMode: data.testMode,
        qrError: data.qrError,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-svh bg-ink px-5 pb-24 pt-32 text-cream md:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/rooms"
          className="link-gold text-xs tracking-[0.3em] uppercase text-gold-light"
        >
          ← Kembali ke kamar
        </Link>
        <h1 className="mt-3 font-serif text-3xl md:text-4xl">Checkout</h1>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Left: details + payment */}
          <div>
            {result ? (
              result.qrString && result.paymentRequestId ? (
                <div className="border border-cream/15 bg-cream/5 p-6">
                  <p className="text-sm text-cream/70">
                    Booking #{result.id} dibuat. Selesaikan pembayaran:
                  </p>
                  <QrisPayment
                    bookingId={result.id}
                    qrString={result.qrString}
                    amount={result.amount ?? total}
                    paymentRequestId={result.paymentRequestId}
                    paymentMethodId={result.paymentMethodId}
                    expiresAt={result.expiresAt}
                    testMode={result.testMode}
                  />
                </div>
              ) : (
                <div className="border border-gold/40 bg-gold/10 p-6 text-sm text-gold-light">
                  ✓ Booking dibuat. ID #{result.id}
                  <p className="mt-1 text-xs text-cream/60">
                    {result.qrError ??
                      "Status: pending — pembayaran diproses manual oleh staff."}
                  </p>
                </div>
              )
            ) : (
              <>
                {/* Guest details */}
                <h2 className="text-xs tracking-[0.3em] uppercase text-cream/60">
                  Data diri
                </h2>
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Nama depan"
                      value={firstname}
                      onChange={(e) => setFirstname(e.target.value)}
                      className="border border-cream/25 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-gold"
                    />
                    <input
                      placeholder="Nama belakang"
                      value={lastname}
                      onChange={(e) => setLastname(e.target.value)}
                      className="border border-cream/25 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-gold"
                    />
                  </div>
                  <input
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-cream/25 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-gold"
                  />
                  <input
                    placeholder="Telepon / WhatsApp"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-cream/25 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-gold"
                  />
                </div>

                {/* Payment method */}
                <h2 className="mt-8 text-xs tracking-[0.3em] uppercase text-cream/60">
                  Metode pembayaran
                </h2>
                <div className="mt-4 space-y-3">
                  {METHODS.map((m) => {
                    const active = method === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!m.enabled}
                        onClick={() => m.enabled && setMethod(m.id)}
                        className={`flex w-full items-center justify-between border px-4 py-3 text-left transition ${
                          active
                            ? "border-gold bg-gold/10"
                            : "border-cream/20 hover:border-cream/40"
                        } ${m.enabled ? "" : "cursor-not-allowed opacity-50"}`}
                      >
                        <span>
                          <span className="text-sm text-cream">{m.label}</span>
                          <span className="mt-0.5 block text-xs text-cream/50">
                            {m.desc}
                          </span>
                        </span>
                        <span
                          className={`ml-3 h-3.5 w-3.5 shrink-0 rounded-full border ${
                            active ? "border-gold bg-gold" : "border-cream/40"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                {error && (
                  <p className="mt-5 border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">
                    {error}
                  </p>
                )}

                <button
                  onClick={submit}
                  disabled={!canSubmit}
                  className="mt-6 w-full border border-gold bg-gold py-3.5 text-xs tracking-[0.25em] uppercase text-ink transition enabled:hover:bg-gold-light disabled:opacity-40"
                >
                  {submitting
                    ? "Memproses…"
                    : `Bayar ${total > 0 ? formatIDR(total) : ""}`}
                </button>
              </>
            )}
          </div>

          {/* Right: summary */}
          <aside className="h-fit border border-cream/15 bg-cream/5 p-6">
            <h2 className="text-xs tracking-[0.3em] uppercase text-cream/60">
              Ringkasan
            </h2>
            <p className="mt-3 font-serif text-xl text-gold-light">{roomName}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Check-in" value={from || "—"} />
              <Row label="Check-out" value={to || "—"} />
              <Row label="Malam" value={n ? String(n) : "—"} />
              <Row label="Tamu" value={`${adults} dewasa${children ? `, ${children} anak` : ""}`} />
            </dl>
            <div className="mt-4 border-t border-cream/15 pt-4">
              {incomplete ? (
                <p className="text-sm text-red-300">
                  Data kamar/tanggal tidak lengkap. Kembali ke halaman kamar.
                </p>
              ) : loadingAvail ? (
                <p className="text-sm text-cream/50">Mengecek harga…</p>
              ) : availError ? (
                <p className="text-sm text-red-300">{availError}</p>
              ) : soldOut ? (
                <p className="text-sm text-red-300">
                  Tidak tersedia untuk tanggal ini.
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.2em] text-gold-light">
                    Total
                  </span>
                  <span className="font-serif text-xl text-gold-light">
                    {total > 0 ? formatIDR(total) : "—"}
                  </span>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-cream/55">{label}</dt>
      <dd className="text-right text-cream/90">{value}</dd>
    </div>
  );
}
