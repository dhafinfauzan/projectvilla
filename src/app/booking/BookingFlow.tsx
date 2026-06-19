"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLang } from "@/context/LanguageContext";
import { formatDate, formatIDR, nightsBetween } from "@/lib/format";
import { villas } from "@/lib/villas";

type Step = 1 | 2 | 3 | 4;
type Availability = "unknown" | "checking" | "available" | "unavailable";

const stepKeys = ["booking.step1", "booking.step2", "booking.step3", "booking.step4"];

const fadeSlide = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
};

export default function BookingFlow() {
  const { t, lang } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();

  const preselected = searchParams.get("villa");
  const [step, setStep] = useState<Step>(preselected ? 2 : 1);
  const [villaSlug, setVillaSlug] = useState<string | null>(
    villas.some((v) => v.slug === preselected) ? preselected : null
  );
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [availability, setAvailability] = useState<Availability>("unknown");
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [requests, setRequests] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live price returned by QloApps for the selected dates (source of truth).
  const [qloTotal, setQloTotal] = useState<number | null>(null);

  const villa = useMemo(
    () => villas.find((v) => v.slug === villaSlug) ?? null,
    [villaSlug]
  );

  const nights =
    checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;
  // Prefer the QloApps total once availability is checked; fall back to the
  // listed nightly rate for the on-screen estimate before that.
  const total =
    qloTotal ?? (villa && nights > 0 ? nights * villa.pricePerNight : 0);

  const today = new Date().toISOString().slice(0, 10);

  async function checkAvailability() {
    if (!villa || nights < 1) return;
    setAvailability("checking");
    setError(null);
    try {
      const res = await fetch("/api/check-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_from: checkIn,
          date_to: checkOut,
          adults: guests,
          children: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("booking.errorGeneric"));
        setAvailability("unknown");
        return;
      }
      type AriRoom = { id: number; totalPrice: number; availableRooms: number };
      const match = (data.roomTypes as AriRoom[] | undefined)?.find(
        (rt) => rt.id === villa.qloRoomTypeId
      );
      if (match && match.availableRooms > 0) {
        setQloTotal(match.totalPrice > 0 ? match.totalPrice : null);
        setAvailability("available");
      } else {
        setQloTotal(null);
        setAvailability("unavailable");
      }
    } catch {
      setAvailability("unknown");
      setError(t("booking.errorGeneric"));
    }
  }

  async function submitBooking() {
    if (!villa) return;
    setSubmitting(true);
    setError(null);
    try {
      // QloApps stores first/last name separately.
      const parts = guestName.trim().split(/\s+/);
      const firstname = parts.shift() ?? guestName;
      const lastname = parts.join(" ") || firstname;

      const res = await fetch("/api/submit-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstname,
          lastname,
          email,
          phone,
          id_room_type: villa.qloRoomTypeId,
          checkin_date: checkIn,
          checkout_date: checkOut,
          adults: guests,
          children: 0,
          total_price: total,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("booking.errorGeneric"));
        setSubmitting(false);
        return;
      }
      // Pass the QloApps booking id + summary to the confirmation page
      // (there's no public GET-by-id, so we render from these params).
      const params = new URLSearchParams({
        id: String(data.bookingId),
        villa: villa.name,
        checkIn,
        checkOut,
        guests: String(guests),
        total: String(total),
        name: guestName,
      });
      router.push(`/booking/confirmation?${params.toString()}`);
    } catch {
      setError(t("booking.errorGeneric"));
      setSubmitting(false);
    }
  }

  const detailsValid =
    guestName.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    phone.trim().length > 5;

  return (
    <div className="min-h-svh bg-ink pb-24 pt-28 text-cream md:pt-36">
      <div className="mx-auto max-w-4xl px-5 md:px-8">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center font-serif text-3xl md:text-5xl"
        >
          {t("booking.title")}
        </motion.h1>

        {/* Step indicator */}
        <div className="mx-auto mt-10 flex max-w-lg items-center">
          {stepKeys.map((key, i) => {
            const n = (i + 1) as Step;
            const active = step === n;
            const done = step > n;
            return (
              <div key={key} className="flex flex-1 items-center last:flex-none">
                <button
                  onClick={() => done && setStep(n)}
                  className="flex flex-col items-center gap-2"
                  disabled={!done}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm transition-all duration-300 ${
                      active
                        ? "border-gold bg-gold text-ink"
                        : done
                          ? "border-gold text-gold"
                          : "border-cream/25 text-cream/40"
                    }`}
                  >
                    {done ? "✓" : n}
                  </span>
                  <span
                    className={`text-[0.6rem] tracking-[0.2em] uppercase ${
                      active ? "text-gold-light" : "text-cream/40"
                    }`}
                  >
                    {t(key)}
                  </span>
                </button>
                {i < stepKeys.length - 1 && (
                  <div
                    className={`mx-2 mb-6 h-px flex-1 ${
                      done ? "bg-gold" : "bg-cream/20"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mx-auto mt-8 max-w-lg border border-red-400/40 bg-red-400/10 p-4 text-center text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="mt-12">
          <AnimatePresence mode="wait">
            {/* ── Step 1 — villa ── */}
            {step === 1 && (
              <motion.div key="s1" {...fadeSlide}>
                <h2 className="mb-8 text-center text-sm tracking-[0.3em] uppercase text-cream/60">
                  {t("booking.selectVilla")}
                </h2>
                <div className="grid gap-5 md:grid-cols-3">
                  {villas.map((v) => (
                    <button
                      key={v.slug}
                      onClick={() => {
                        setVillaSlug(v.slug);
                        setAvailability("unknown");
                        setGuests(Math.min(guests, v.maxGuests));
                        setStep(2);
                      }}
                      className={`group overflow-hidden border text-left transition-all duration-300 ${
                        villaSlug === v.slug
                          ? "border-gold"
                          : "border-cream/15 hover:border-gold/60"
                      }`}
                    >
                      <div className="relative h-44 overflow-hidden">
                        <Image
                          src={v.heroImage}
                          alt={v.name}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-108"
                        />
                      </div>
                      <div className="p-5">
                        <h3 className="font-serif text-lg">{v.name}</h3>
                        <p className="mt-1 text-xs text-cream/60">
                          {v.bedrooms} {t("villas.bedrooms")} · {v.maxGuests}{" "}
                          {t("villas.guests")}
                        </p>
                        <p className="mt-3 text-sm text-gold-light">
                          {formatIDR(v.pricePerNight)}{" "}
                          <span className="text-cream/50">/ {t("villas.night")}</span>
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Step 2 — dates ── */}
            {step === 2 && villa && (
              <motion.div key="s2" {...fadeSlide} className="mx-auto max-w-lg">
                <h2 className="mb-2 text-center text-sm tracking-[0.3em] uppercase text-cream/60">
                  {t("booking.selectDates")}
                </h2>
                <p className="mb-8 text-center font-serif text-xl text-gold-light">
                  {villa.name}
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-cream/60">
                      {t("booking.checkIn")}
                    </span>
                    <input
                      type="date"
                      min={today}
                      value={checkIn}
                      onChange={(e) => {
                        setCheckIn(e.target.value);
                        setAvailability("unknown");
                        setQloTotal(null);
                      }}
                      className="w-full border border-cream/25 bg-transparent px-4 py-3.5 text-sm text-cream outline-none transition focus:border-gold"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-cream/60">
                      {t("booking.checkOut")}
                    </span>
                    <input
                      type="date"
                      min={checkIn || today}
                      value={checkOut}
                      onChange={(e) => {
                        setCheckOut(e.target.value);
                        setAvailability("unknown");
                        setQloTotal(null);
                      }}
                      className="w-full border border-cream/25 bg-transparent px-4 py-3.5 text-sm text-cream outline-none transition focus:border-gold"
                    />
                  </label>
                </div>

                <label className="mt-5 block">
                  <span className="mb-2 block text-xs tracking-[0.2em] uppercase text-cream/60">
                    {t("booking.guests")}
                  </span>
                  <div className="flex items-center border border-cream/25">
                    <button
                      onClick={() => setGuests(Math.max(1, guests - 1))}
                      className="px-5 py-3.5 text-gold-light transition hover:bg-cream/5"
                    >
                      −
                    </button>
                    <span className="flex-1 text-center text-sm">{guests}</span>
                    <button
                      onClick={() => setGuests(Math.min(villa.maxGuests, guests + 1))}
                      className="px-5 py-3.5 text-gold-light transition hover:bg-cream/5"
                    >
                      +
                    </button>
                  </div>
                </label>

                {nights > 0 && (
                  <p className="mt-5 text-center text-sm text-cream/70">
                    {nights} {t("booking.nights")} ·{" "}
                    <span className="text-gold-light">{formatIDR(total)}</span>
                  </p>
                )}

                {availability === "available" && (
                  <p className="mt-5 border border-emerald-400/40 bg-emerald-400/10 p-3.5 text-center text-sm text-emerald-200">
                    ✓ {t("booking.available")}
                  </p>
                )}
                {availability === "unavailable" && (
                  <p className="mt-5 border border-red-400/40 bg-red-400/10 p-3.5 text-center text-sm text-red-200">
                    {t("booking.unavailable")}
                  </p>
                )}

                <div className="mt-8 flex gap-4">
                  <button
                    onClick={() => setStep(1)}
                    className="border border-cream/25 px-7 py-3.5 text-xs tracking-[0.25em] uppercase text-cream/70 transition hover:border-cream/60"
                  >
                    {t("booking.back")}
                  </button>
                  {availability !== "available" ? (
                    <button
                      onClick={checkAvailability}
                      disabled={nights < 1 || availability === "checking"}
                      className="flex-1 border border-gold bg-gold/10 py-3.5 text-xs tracking-[0.25em] uppercase text-gold-light transition enabled:hover:bg-gold enabled:hover:text-ink disabled:opacity-40"
                    >
                      {availability === "checking"
                        ? t("booking.processing")
                        : t("booking.checkAvailability")}
                    </button>
                  ) : (
                    <button
                      onClick={() => setStep(3)}
                      className="flex-1 border border-gold bg-gold py-3.5 text-xs tracking-[0.25em] uppercase text-ink transition hover:bg-gold-light"
                    >
                      {t("booking.continue")}
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 3 — details ── */}
            {step === 3 && (
              <motion.div key="s3" {...fadeSlide} className="mx-auto max-w-lg">
                <h2 className="mb-8 text-center text-sm tracking-[0.3em] uppercase text-cream/60">
                  {t("booking.yourDetails")}
                </h2>

                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder={t("booking.fullName")}
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full border border-cream/25 bg-transparent px-4 py-3.5 text-sm text-cream placeholder-cream/40 outline-none transition focus:border-gold"
                  />
                  <input
                    type="email"
                    placeholder={t("booking.email")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-cream/25 bg-transparent px-4 py-3.5 text-sm text-cream placeholder-cream/40 outline-none transition focus:border-gold"
                  />
                  <input
                    type="tel"
                    placeholder={t("booking.phone")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-cream/25 bg-transparent px-4 py-3.5 text-sm text-cream placeholder-cream/40 outline-none transition focus:border-gold"
                  />
                  <textarea
                    rows={4}
                    placeholder={t("booking.requests")}
                    value={requests}
                    onChange={(e) => setRequests(e.target.value)}
                    className="w-full resize-none border border-cream/25 bg-transparent px-4 py-3.5 text-sm text-cream placeholder-cream/40 outline-none transition focus:border-gold"
                  />
                </div>

                <div className="mt-8 flex gap-4">
                  <button
                    onClick={() => setStep(2)}
                    className="border border-cream/25 px-7 py-3.5 text-xs tracking-[0.25em] uppercase text-cream/70 transition hover:border-cream/60"
                  >
                    {t("booking.back")}
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    disabled={!detailsValid}
                    className="flex-1 border border-gold bg-gold py-3.5 text-xs tracking-[0.25em] uppercase text-ink transition enabled:hover:bg-gold-light disabled:opacity-40"
                  >
                    {t("booking.continue")}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 4 — confirm & pay ── */}
            {step === 4 && villa && (
              <motion.div key="s4" {...fadeSlide} className="mx-auto max-w-lg">
                <h2 className="mb-8 text-center text-sm tracking-[0.3em] uppercase text-cream/60">
                  {t("booking.summary")}
                </h2>

                <div className="border border-cream/15">
                  <div className="relative h-44 overflow-hidden">
                    <Image
                      src={villa.heroImage}
                      alt={villa.name}
                      fill
                      sizes="512px"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
                    <p className="absolute bottom-4 left-5 font-serif text-2xl">
                      {villa.name}
                    </p>
                  </div>

                  <dl className="divide-y divide-cream/10 px-6 text-sm">
                    {[
                      [t("booking.checkIn"), formatDate(checkIn, lang)],
                      [t("booking.checkOut"), formatDate(checkOut, lang)],
                      [
                        t("booking.guests"),
                        String(guests),
                      ],
                      [
                        `${formatIDR(villa.pricePerNight)} × ${nights} ${t("booking.nights")}`,
                        formatIDR(total),
                      ],
                      [t("booking.fullName"), guestName],
                      [t("booking.email"), email],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-3.5">
                        <dt className="text-cream/55">{k}</dt>
                        <dd className="text-right">{v}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between py-4 text-base">
                      <dt className="tracking-[0.2em] uppercase text-gold-light">
                        {t("booking.total")}
                      </dt>
                      <dd className="font-serif text-xl text-gold-light">
                        {formatIDR(total)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <p className="mt-5 text-center text-xs leading-relaxed text-cream/50">
                  {t("booking.paymentNote")}
                </p>

                <div className="mt-8 flex gap-4">
                  <button
                    onClick={() => setStep(3)}
                    disabled={submitting}
                    className="border border-cream/25 px-7 py-3.5 text-xs tracking-[0.25em] uppercase text-cream/70 transition hover:border-cream/60"
                  >
                    {t("booking.back")}
                  </button>
                  <button
                    onClick={submitBooking}
                    disabled={submitting}
                    className="flex-1 border border-gold bg-gold py-3.5 text-xs tracking-[0.25em] uppercase text-ink transition enabled:hover:bg-gold-light disabled:opacity-60"
                  >
                    {submitting ? t("booking.processing") : t("booking.payNow")}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
