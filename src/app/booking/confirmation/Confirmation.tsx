"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLang } from "@/context/LanguageContext";
import { formatDate, formatIDR, nightsBetween } from "@/lib/format";

type BookingDetails = {
  bookingCode: string;
  villaName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  guestName: string;
  totalAmount: number;
  status: string;
};

export default function Confirmation() {
  const { t, lang } = useLang();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  // QloApps bookings arrive as ?id=<n> plus a summary in the query string
  // (no public GET-by-id endpoint), so we render straight from the params.
  const qloId = searchParams.get("id");

  // QloApps booking is derived purely from query params — no fetch needed.
  const qloBooking = useMemo<BookingDetails | null>(() => {
    if (!qloId) return null;
    const checkIn = searchParams.get("checkIn") ?? "";
    const checkOut = searchParams.get("checkOut") ?? "";
    return {
      bookingCode: `#${qloId}`,
      villaName: searchParams.get("villa") ?? "",
      checkIn,
      checkOut,
      nights: checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0,
      guests: Number(searchParams.get("guests") ?? 0),
      guestName: searchParams.get("name") ?? "",
      totalAmount: Number(searchParams.get("total") ?? 0),
      status: "PENDING",
    };
  }, [qloId, searchParams]);

  // Legacy/Prisma path: look up a booking by its code.
  const [fetched, setFetched] = useState<BookingDetails | null>(null);
  const [loadingFetch, setLoadingFetch] = useState(Boolean(code) && !qloId);

  useEffect(() => {
    if (qloId || !code) return;
    fetch(`/api/bookings?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((data) => setFetched(data.booking ?? null))
      .finally(() => setLoadingFetch(false));
  }, [code, qloId]);

  const booking = qloBooking ?? fetched;
  const loading = loadingFetch;

  return (
    <div className="flex min-h-svh items-center justify-center bg-ink px-5 pb-20 pt-32 text-cream">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg"
      >
        {loading ? (
          <p className="text-center text-cream/60">…</p>
        ) : !booking ? (
          <div className="text-center">
            <p className="text-cream/70">Booking not found.</p>
            <Link
              href="/"
              className="link-gold mt-6 inline-block text-sm tracking-[0.25em] uppercase text-gold-light"
            >
              {t("confirmation.backHome")}
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full border border-gold text-2xl text-gold"
              >
                ✓
              </motion.div>
              <h1 className="font-serif text-3xl md:text-4xl">
                {t("confirmation.title")}
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-cream/70">
                {t("confirmation.subtitle")}
              </p>
            </div>

            <div className="mt-10 border border-cream/15">
              <div className="border-b border-cream/15 bg-cream/5 px-6 py-5 text-center">
                <p className="text-xs tracking-[0.3em] uppercase text-cream/50">
                  {t("confirmation.code")}
                </p>
                <p className="mt-1 font-serif text-2xl tracking-[0.15em] text-gold-light">
                  {booking.bookingCode}
                </p>
              </div>
              <dl className="divide-y divide-cream/10 px-6 text-sm">
                {[
                  ["Villa", booking.villaName],
                  [t("booking.checkIn"), formatDate(booking.checkIn, lang)],
                  [t("booking.checkOut"), formatDate(booking.checkOut, lang)],
                  [
                    t("booking.guests"),
                    String(booking.guests),
                  ],
                  [t("booking.total"), formatIDR(booking.totalAmount)],
                  [
                    t("confirmation.status"),
                    booking.status === "CONFIRMED"
                      ? t("confirmation.confirmed")
                      : t("confirmation.pendingPayment"),
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-3.5">
                    <dt className="text-cream/55">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <p className="mt-6 text-center text-xs text-cream/50">
              {t("confirmation.emailNote")}
            </p>

            <div className="mt-8 text-center">
              <Link
                href="/"
                className="inline-block border border-gold bg-gold/10 px-8 py-3.5 text-xs tracking-[0.25em] uppercase text-gold-light transition hover:bg-gold hover:text-ink"
              >
                {t("confirmation.backHome")}
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
