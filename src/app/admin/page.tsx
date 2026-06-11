import { prisma } from "@/lib/prisma";
import { expireStaleBookings } from "@/lib/bookings";
import { formatIDR } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bookings — Admin | The Taru Villas",
  robots: { index: false, follow: false },
};

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  PENDING_PAYMENT: "border-gold/40 bg-gold/10 text-gold-light",
  CANCELLED: "border-red-400/40 bg-red-400/10 text-red-300",
  EXPIRED: "border-cream/20 bg-cream/5 text-cream/50",
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const adminKey = process.env.ADMIN_KEY;

  // Simple key gate: /admin?key=<ADMIN_KEY>. Replace with real auth
  // (e.g. NextAuth / Clerk) before adding staff accounts.
  if (!adminKey || key !== adminKey) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-ink px-5 text-cream">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-3xl">Restricted</h1>
          <p className="mt-4 text-sm leading-relaxed text-cream/60">
            {adminKey
              ? "This page requires an access key. Open /admin?key=<your key>."
              : "Set ADMIN_KEY in .env to enable the admin dashboard, then open /admin?key=<your key>."}
          </p>
        </div>
      </div>
    );
  }

  await expireStaleBookings();

  const bookings = await prisma.booking.findMany({
    include: { villa: true },
    orderBy: { createdAt: "desc" },
  });

  const confirmed = bookings.filter((b) => b.status === "CONFIRMED");
  const pending = bookings.filter((b) => b.status === "PENDING_PAYMENT");
  const revenue = confirmed.reduce((sum, b) => sum + b.totalAmount, 0);

  const stats = [
    ["Total bookings", String(bookings.length)],
    ["Confirmed", String(confirmed.length)],
    ["Pending payment", String(pending.length)],
    ["Confirmed revenue", formatIDR(revenue)],
  ];

  return (
    <div className="min-h-svh bg-ink px-5 pb-20 pt-32 text-cream md:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs tracking-[0.3em] uppercase text-gold-light">
          Admin
        </p>
        <h1 className="mt-2 font-serif text-3xl md:text-4xl">Bookings</h1>

        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="border border-cream/15 bg-cream/5 p-5">
              <p className="text-xs tracking-[0.2em] uppercase text-cream/50">
                {label}
              </p>
              <p className="mt-2 font-serif text-2xl text-gold-light">
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 overflow-x-auto border border-cream/15">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-cream/15 bg-cream/5 text-xs tracking-[0.15em] uppercase text-cream/50">
                <th className="px-4 py-4 font-normal">Code</th>
                <th className="px-4 py-4 font-normal">Villa</th>
                <th className="px-4 py-4 font-normal">Guest</th>
                <th className="px-4 py-4 font-normal">Dates</th>
                <th className="px-4 py-4 font-normal">Pax</th>
                <th className="px-4 py-4 font-normal">Total</th>
                <th className="px-4 py-4 font-normal">Status</th>
                <th className="px-4 py-4 font-normal">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream/10">
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-cream/50">
                    No bookings yet.
                  </td>
                </tr>
              )}
              {bookings.map((b) => (
                <tr key={b.id} className="transition hover:bg-cream/5">
                  <td className="px-4 py-4 font-mono text-xs tracking-wider text-gold-light">
                    {b.bookingCode}
                  </td>
                  <td className="px-4 py-4">{b.villa.name}</td>
                  <td className="px-4 py-4">
                    <p>{b.guestName}</p>
                    <p className="text-xs text-cream/50">{b.email}</p>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}
                    <p className="text-xs text-cream/50">
                      {b.nights} night{b.nights > 1 ? "s" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-4">{b.guests}</td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {formatIDR(b.totalAmount)}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-block border px-2.5 py-1 text-[11px] tracking-wider uppercase ${
                        STATUS_STYLES[b.status] ?? STATUS_STYLES.EXPIRED
                      }`}
                    >
                      {b.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs whitespace-nowrap text-cream/50">
                    {fmtDate(b.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
