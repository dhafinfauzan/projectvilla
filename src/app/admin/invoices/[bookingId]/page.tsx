import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

function money(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default async function InvoicePage({ params }: { params: Promise<{ bookingId: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin");
  const { bookingId } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { villa: true, assignedUnit: true, folio: { include: { entries: { where: { voidedAt: null }, orderBy: { createdAt: "asc" } } } } },
  });
  if (!booking) notFound();
  const entries = booking.folio?.entries ?? [];
  const debit = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const credit = entries.reduce((sum, entry) => sum + entry.credit, 0);
  const balance = debit - credit;

  return <main className="min-h-svh bg-[#ece9e1] px-4 py-8 text-[#172b21] print:bg-white print:p-0">
    <article className="mx-auto max-w-4xl bg-white p-8 shadow-sm sm:p-12 print:max-w-none print:shadow-none">
      <header className="flex flex-col gap-6 border-b-2 border-[#244c38] pb-8 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-3"><span className="grid size-11 place-items-center border border-[#244c38] font-serif text-xl">V</span><div><p className="font-serif text-2xl">The Taru Villas</p><p className="text-[9px] tracking-[0.17em] text-[#738078] uppercase">Ubud, Bali · VillaOS</p></div></div><p className="mt-5 text-xs leading-5 text-[#66726a]">Guest folio / invoice<br />Currency: Indonesian Rupiah (IDR)</p></div><div className="text-left sm:text-right"><p className="text-[10px] tracking-[0.15em] text-[#738078] uppercase">Invoice</p><p className="mt-2 font-mono text-xl font-semibold">{booking.bookingCode}</p><p className="mt-2 text-xs text-[#66726a]">Issued {new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date())}</p><div className="mt-5"><PrintButton /></div></div></header>
      <section className="grid gap-8 border-b border-[#d9d7cf] py-8 sm:grid-cols-2"><div><p className="text-[9px] tracking-[0.14em] text-[#738078] uppercase">Bill to</p><p className="mt-2 font-serif text-2xl">{booking.guestName}</p><p className="mt-2 text-sm leading-6 text-[#59675f]">{booking.email}<br />{booking.phone}</p></div><dl className="grid grid-cols-2 gap-5 text-sm"><div><dt className="text-[9px] tracking-[0.12em] text-[#738078] uppercase">Stay</dt><dd className="mt-1">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(booking.checkIn)}<br />{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(booking.checkOut)}</dd></div><div><dt className="text-[9px] tracking-[0.12em] text-[#738078] uppercase">Villa</dt><dd className="mt-1">{booking.villa.name}<br />{booking.assignedUnit?.code ?? "Unassigned"}</dd></div><div><dt className="text-[9px] tracking-[0.12em] text-[#738078] uppercase">Guests</dt><dd className="mt-1">{booking.guests}</dd></div><div><dt className="text-[9px] tracking-[0.12em] text-[#738078] uppercase">Status</dt><dd className="mt-1">{booking.status.replaceAll("_", " ")}</dd></div></dl></section>
      <section className="py-8"><table className="w-full text-left text-sm"><thead className="border-y border-[#d9d7cf] bg-[#f6f4ee] text-[9px] tracking-[0.12em] text-[#738078] uppercase"><tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Description</th><th className="px-3 py-3 text-right">Debit</th><th className="px-3 py-3 text-right">Credit</th></tr></thead><tbody className="divide-y divide-[#e5e3dc]">{entries.map((entry) => <tr key={entry.id}><td className="px-3 py-4 text-xs">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(entry.serviceDate)}</td><td className="px-3 py-4"><p>{entry.description}</p><p className="mt-1 text-[9px] tracking-[0.1em] text-[#7a857e] uppercase">{entry.entryType.replaceAll("_", " ")}</p></td><td className="px-3 py-4 text-right">{entry.debit ? money(entry.debit) : "—"}</td><td className="px-3 py-4 text-right">{entry.credit ? money(entry.credit) : "—"}</td></tr>)}</tbody></table>{!entries.length && <p className="border-b border-[#d9d7cf] px-3 py-8 text-center text-sm text-[#738078]">No folio entries.</p>}</section>
      <section className="ml-auto max-w-sm border-t-2 border-[#244c38] pt-4"><dl className="space-y-3 text-sm"><div className="flex justify-between"><dt>Total charges</dt><dd>{money(debit)}</dd></div><div className="flex justify-between"><dt>Payments / credits</dt><dd>{money(credit)}</dd></div><div className="flex justify-between border-t border-[#d9d7cf] pt-4 font-semibold"><dt>Balance due</dt><dd className="font-serif text-2xl">{money(balance)}</dd></div></dl></section>
      <footer className="mt-14 border-t border-[#d9d7cf] pt-5 text-center text-[10px] leading-5 text-[#7a857e]">Thank you for staying at The Taru Villas. This document is generated from the VillaOS guest ledger.<br />Prepared by {staff.name}.</footer>
    </article>
  </main>;
}
