"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { formatIDR } from "@/lib/format";

type Props = {
  bookingId: string | number;
  qrString: string;
  amount: number;
  paymentRequestId: string;
  paymentMethodId?: string | null;
  expiresAt?: string | null;
  testMode?: boolean;
};

type Status = "PENDING" | "SUCCEEDED" | "FAILED";

export default function QrisPayment({
  bookingId,
  qrString,
  amount,
  paymentRequestId,
  paymentMethodId,
  expiresAt,
  testMode,
}: Props) {
  const [status, setStatus] = useState<Status>("PENDING");
  const [checking, setChecking] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(() =>
    expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : null
  );

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(
        `/api/xendit/check-status?payment_request_id=${encodeURIComponent(paymentRequestId)}`
      );
      const data = await res.json();
      if (res.ok && data.status) {
        if (data.status === "SUCCEEDED") setStatus("SUCCEEDED");
        else if (data.status === "FAILED" || data.status === "EXPIRED")
          setStatus("FAILED");
      }
    } catch {
      // transient — keep polling
    } finally {
      setChecking(false);
    }
  }, [paymentRequestId]);

  const simulate = useCallback(async () => {
    if (!paymentMethodId) return;
    setSimulating(true);
    try {
      await fetch("/api/xendit/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId, amount }),
      });
      setTimeout(checkStatus, 1500); // let Xendit settle, then refresh
    } finally {
      setSimulating(false);
    }
  }, [paymentMethodId, amount, checkStatus]);

  // Poll every 5s while pending. The effect re-runs when status changes, so
  // the interval is cleared automatically once payment resolves.
  useEffect(() => {
    if (status !== "PENDING") return;
    const id = setInterval(checkStatus, 5000);
    return () => clearInterval(id);
  }, [status, checkStatus]);

  // Countdown to QR expiry (updates from the interval callback only).
  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const id = setInterval(
      () => setRemaining(Math.max(0, target - Date.now())),
      1000
    );
    return () => clearInterval(id);
  }, [expiresAt]);

  if (status === "SUCCEEDED") {
    return (
      <div className="mt-4 border border-emerald-400/40 bg-emerald-400/10 p-6 text-center text-sm text-emerald-200">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400 text-xl">
          ✓
        </div>
        <p className="font-serif text-lg text-emerald-100">Pembayaran berhasil</p>
        <p className="mt-1 text-xs text-emerald-300/80">
          Booking #{bookingId} sudah lunas. Terima kasih!
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-cream/15 bg-cream/5 p-5 text-center">
      <p className="text-xs tracking-[0.25em] uppercase text-cream/60">
        Scan untuk membayar
      </p>
      <p className="mt-2 font-serif text-2xl text-gold-light">{formatIDR(amount)}</p>

      <div className="mx-auto mt-4 w-fit bg-white p-3">
        <QRCode value={qrString} size={196} />
      </div>

      {status === "FAILED" && (
        <p className="mt-4 text-xs text-red-300">
          Pembayaran gagal atau QR kedaluwarsa. Silakan buat booking ulang.
        </p>
      )}

      {remaining != null && remaining > 0 && (
        <p className="mt-3 text-xs text-cream/50">
          Berlaku {formatRemaining(remaining)} lagi
        </p>
      )}

      <p className="mx-auto mt-4 max-w-xs text-xs leading-relaxed text-cream/60">
        Scan QR ini dengan GoPay, OVO, DANA, ShopeePay, atau mobile banking
        apa pun.
      </p>

      <button
        onClick={checkStatus}
        disabled={checking}
        className="mt-4 w-full border border-gold bg-gold/10 py-2.5 text-xs tracking-[0.2em] uppercase text-gold-light transition enabled:hover:bg-gold enabled:hover:text-ink disabled:opacity-50"
      >
        {checking ? "Mengecek…" : "Cek Status Pembayaran"}
      </button>
      <p className="mt-2 text-[0.65rem] text-cream/40">
        Status diperbarui otomatis tiap 5 detik.
      </p>

      {testMode && paymentMethodId && (
        <button
          onClick={simulate}
          disabled={simulating}
          className="mt-3 w-full border border-dashed border-cream/30 py-2 text-[0.65rem] tracking-[0.15em] uppercase text-cream/50 transition enabled:hover:border-cream/60 enabled:hover:text-cream/80 disabled:opacity-50"
        >
          {simulating ? "Menyimulasikan…" : "⚙ Simulate Payment (test mode)"}
        </button>
      )}
    </div>
  );
}

function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} jam ${m} menit`;
  const s = Math.floor((ms % 60000) / 1000);
  return `${m} menit ${s} detik`;
}
