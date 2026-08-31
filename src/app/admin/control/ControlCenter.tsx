"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  commitImportBatch,
  createMaintenanceTicket,
  createStaffUser,
  postFolioCharge,
  postManualPayment,
  postRefund,
  resetStaffPassword,
  runLocalBackup,
  runNightAudit,
  setDailyRate,
  setStaffActive,
  stageQloAppsCsv,
  updateMaintenanceTicket,
  updateOperationalSetting,
  type ControlActionResult,
} from "./actions";

type Section = "overview" | "rates" | "finance" | "maintenance" | "night-audit" | "reports" | "migration" | "team" | "system";

export type ControlSnapshot = {
  generatedAt: string;
  today: string;
  staff: { id: string; name: string; email: string; role: string };
  permissions: { rates: boolean; finance: boolean; maintenance: boolean; nightAudit: boolean; migration: boolean; staff: boolean; audit: boolean; backup: boolean };
  stats: { totalRooms: number; occupiedToday: number; occupancyPercent: number; revenue30: number; outstanding: number; openMaintenance: number; qloMappings: number };
  villas: Array<{ id: string; slug: string; name: string; pricePerNight: number; totalUnits: number }>;
  roomUnits: Array<{ id: string; code: string; villaName: string; operationalStatus: string }>;
  dailyRates: Array<{ id: string; villaId: string; villaName: string; date: string; price: number; minStay: number; stopSell: boolean; closedToArrival: boolean; closedToDeparture: boolean }>;
  folios: Array<{ bookingId: string; bookingCode: string; guestName: string; villaName: string; status: string; folioId: string; folioStatus: string; debit: number; credit: number; balance: number; entries: Array<{ id: string; entryType: string; description: string; debit: number; credit: number; serviceDate: string }> }>;
  maintenance: Array<{ id: string; ticketCode: string; roomCode: string; villaName: string; title: string; description: string | null; priority: string; status: string; blocksInventory: boolean; assignedTo: string | null; createdAt: string }>;
  businessDays: Array<{ id: string; date: string; status: string; closedBy: string | null; summaryJson: string | null; audited: boolean }>;
  importBatches: Array<{ id: string; fileName: string; status: string; totalRows: number; validRows: number; invalidRows: number; committedRows: number; summaryJson: string | null; createdAt: string; records: Array<{ rowNumber: number; status: string; errorsJson: string | null }> }>;
  staffUsers: Array<{ id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null }>;
  auditLogs: Array<{ id: string; action: string; entityType: string; entityId: string | null; actorName: string; createdAt: string }>;
  settings: Record<string, string>;
  backups: Array<{ id: string; status: string; location: string | null; sizeBytes: number | null; checksum: string | null; createdBy: string; createdAt: string }>;
  report: { sourceCounts: Array<{ label: string; count: number }>; statusCounts: Array<{ label: string; count: number }>; forecast: Array<{ date: string; occupied: number; percent: number }>; payments: Array<{ date: string; amount: number; provider: string }> };
};

const SECTION_META: Record<Section, { number: string; label: string; eyebrow: string; title: string }> = {
  overview: { number: "01", label: "Overview", eyebrow: "Property command", title: "Control center" },
  rates: { number: "02", label: "Rates", eyebrow: "Commercial controls", title: "Rates & restrictions" },
  finance: { number: "03", label: "Finance", eyebrow: "Guest accounting", title: "Folios & payments" },
  maintenance: { number: "04", label: "Maintenance", eyebrow: "Asset operations", title: "Maintenance control" },
  "night-audit": { number: "05", label: "Night audit", eyebrow: "Business day", title: "Close the day" },
  reports: { number: "06", label: "Reports", eyebrow: "Management view", title: "Property performance" },
  migration: { number: "07", label: "Migration", eyebrow: "QloApps transition", title: "Migration & cutover" },
  team: { number: "08", label: "Team", eyebrow: "Access control", title: "Staff & roles" },
  system: { number: "09", label: "System", eyebrow: "Reliability", title: "Audit, backup & health" },
};

function money(amount: number, compact = false): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0, notation: compact ? "compact" : "standard" }).format(amount);
}

function date(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function parseSummary(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
}

function Field({ label, children, span = false }: { label: string; children: React.ReactNode; span?: boolean }) {
  return <label className={`text-[10px] font-semibold tracking-[0.11em] text-[#69766e] uppercase ${span ? "sm:col-span-2" : ""}`}>{label}{children}</label>;
}

const inputClass = "mt-2 h-11 w-full border border-[#cbc9c0] bg-white px-3 text-sm text-[#183126] outline-none transition focus:border-[#315b45]";
const buttonClass = "h-11 bg-[#244c38] px-5 text-[10px] font-semibold tracking-[0.12em] text-white uppercase transition hover:bg-[#193729] disabled:cursor-not-allowed disabled:opacity-45";

export default function ControlCenter({ snapshot }: { snapshot: ControlSnapshot }) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [selectedFolioId, setSelectedFolioId] = useState(snapshot.folios[0]?.folioId ?? "");
  const [toast, setToast] = useState<ControlActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedFolio = snapshot.folios.find((folio) => folio.folioId === selectedFolioId) ?? snapshot.folios[0] ?? null;
  const settings = snapshot.settings;

  const paymentByDay = useMemo(() => {
    const days = new Map<string, number>();
    for (const payment of snapshot.report.payments) {
      const key = payment.date.slice(0, 10);
      days.set(key, (days.get(key) ?? 0) + payment.amount);
    }
    return [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [snapshot.report.payments]);

  const notify = (result: ControlActionResult) => {
    setToast(result);
    if (result.ok) router.refresh();
    window.setTimeout(() => setToast(null), 4200);
  };

  const run = (promise: Promise<ControlActionResult>) => startTransition(async () => notify(await promise));
  const submit = (event: React.FormEvent<HTMLFormElement>, action: (form: FormData) => Promise<ControlActionResult>, reset = false) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    startTransition(async () => {
      const result = await action(data);
      notify(result);
      if (result.ok && reset) element.reset();
    });
  };

  const renderOverview = () => {
    const readiness = [
      { label: "Individual staff accounts", done: snapshot.staffUsers.length > 0 },
      { label: "Inventory lock per room-night", done: true },
      { label: "Payment ledger", done: snapshot.folios.length > 0 },
      { label: "QloApps dry-run", done: snapshot.importBatches.length > 0 },
      { label: "Successful local backup", done: snapshot.backups.some((backup) => backup.status === "COMPLETED") },
      { label: "Pilot mode activated", done: ["PILOT", "READY", "COMPLETED"].includes(settings["cutover.pilot_status"]) },
    ];
    const score = Math.round((readiness.filter((item) => item.done).length / readiness.length) * 100);
    return <div className="space-y-5">
      <section className="grid border border-[#d2d0c7] bg-white sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Occupancy", `${snapshot.stats.occupancyPercent}%`, `${snapshot.stats.occupiedToday}/${snapshot.stats.totalRooms} rooms`],
          ["Revenue · 30d", money(snapshot.stats.revenue30, true), "Successful payments"],
          ["Outstanding", money(snapshot.stats.outstanding, true), "Open folio balance"],
          ["Maintenance", snapshot.stats.openMaintenance, "Open work orders"],
          ["Qlo mappings", snapshot.stats.qloMappings, "Imported identities"],
          ["Cutover readiness", `${score}%`, settings["cutover.pilot_status"]?.replaceAll("_", " ") ?? "Not started"],
        ].map(([label, value, hint]) => <article key={String(label)} className="min-h-36 border-b border-r border-[#e2e0d9] p-5 last:border-r-0 xl:border-b-0">
          <p className="text-[9px] font-semibold tracking-[0.14em] text-[#77827a] uppercase">{label}</p>
          <p className="mt-4 font-serif text-3xl text-[#183126]">{value}</p>
          <p className="mt-2 text-xs text-[#78847c]">{hint}</p>
        </article>)}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="border border-[#d2d0c7] bg-white">
          <div className="border-b border-[#dedcd4] px-5 py-4"><p className="text-[9px] tracking-[0.14em] text-[#77827a] uppercase">30-day outlook</p><h2 className="mt-1 font-serif text-2xl">Forward occupancy</h2></div>
          <div className="flex h-64 items-end gap-1.5 overflow-x-auto px-5 pb-5 pt-8">
            {snapshot.report.forecast.length ? snapshot.report.forecast.map((item) => <div key={item.date} className="group flex min-w-6 flex-1 flex-col items-center justify-end gap-2" title={`${date(item.date)} · ${item.occupied} rooms`}>
              <span className="text-[8px] text-[#758078] opacity-0 group-hover:opacity-100">{item.percent}%</span>
              <div className="w-full min-w-4 bg-[#315b45] transition hover:bg-[#c09a5d]" style={{ height: `${Math.max(3, item.percent * 1.65)}px` }} />
              <span className="text-[8px] text-[#89928c]">{new Date(item.date).getUTCDate()}</span>
            </div>) : <p className="m-auto text-sm text-[#7c867f]">No future occupied room-nights yet.</p>}
          </div>
        </section>
        <section className="border border-[#d2d0c7] bg-[#193126] p-6 text-white">
          <p className="text-[9px] tracking-[0.15em] text-[#9fb1a6] uppercase">Go-live checklist</p>
          <div className="mt-5 space-y-4">{readiness.map((item) => <div key={item.label} className="flex items-center gap-3 border-b border-white/10 pb-3 text-sm"><span className={`grid size-5 place-items-center border text-[10px] ${item.done ? "border-[#8db197] bg-[#315b45]" : "border-[#796656] text-[#c8a878]"}`}>{item.done ? "✓" : "·"}</span><span className={item.done ? "text-[#dce6df]" : "text-[#aab9b0]"}>{item.label}</span></div>)}</div>
          <button onClick={() => setSection("migration")} className="mt-6 text-[10px] font-semibold tracking-[0.13em] text-[#d7bc8d] uppercase">Open cutover controls →</button>
        </section>
      </div>
    </div>;
  };

  const renderRates = () => <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
    <section className="border border-[#d2d0c7] bg-white p-5">
      <p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Best available rate</p><h2 className="mt-1 font-serif text-2xl">Set one day</h2>
      <form onSubmit={(event) => submit(event, setDailyRate)} className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <Field label="Villa"><select name="villaId" className={inputClass}>{snapshot.villas.map((villa) => <option key={villa.id} value={villa.id}>{villa.name}</option>)}</select></Field>
        <Field label="Business date"><input name="date" type="date" min={snapshot.today} defaultValue={snapshot.today} required className={inputClass} /></Field>
        <Field label="Price · IDR"><input name="price" type="number" min="100000" step="50000" defaultValue={snapshot.villas[0]?.pricePerNight} required className={inputClass} /></Field>
        <Field label="Minimum stay"><input name="minStay" type="number" min="1" max="30" defaultValue="1" required className={inputClass} /></Field>
        <div className="space-y-3 border-y border-[#e0ded6] py-4 text-xs text-[#536159]">
          {[ ["stopSell", "Stop sell"], ["closedToArrival", "Closed to arrival"], ["closedToDeparture", "Closed to departure"] ].map(([name, label]) => <label key={name} className="flex items-center gap-3"><input name={name} type="checkbox" className="size-4 accent-[#244c38]" />{label}</label>)}
        </div>
        <button disabled={!snapshot.permissions.rates || isPending} className={buttonClass}>Save daily rate</button>
      </form>
      {!snapshot.permissions.rates && <p className="mt-3 text-xs text-[#9a5b4a]">Your role has read-only rate access.</p>}
    </section>
    <section className="min-w-0 border border-[#d2d0c7] bg-white">
      <div className="border-b border-[#dedcd4] px-5 py-4"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Next 30 days</p><h2 className="mt-1 font-serif text-2xl">Overrides & restrictions</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#f1efe9] text-[9px] tracking-[0.12em] text-[#758078] uppercase"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Villa</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Min stay</th><th className="px-4 py-3">Restrictions</th></tr></thead>
      <tbody className="divide-y divide-[#e5e3dc]">{snapshot.dailyRates.map((rate) => <tr key={rate.id}><td className="px-4 py-3 font-medium">{date(rate.date)}</td><td className="px-4 py-3">{rate.villaName}</td><td className="px-4 py-3 font-medium">{money(rate.price)}</td><td className="px-4 py-3">{rate.minStay} nights</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{rate.stopSell && <Pill tone="red">Stop sell</Pill>}{rate.closedToArrival && <Pill tone="gold">CTA</Pill>}{rate.closedToDeparture && <Pill tone="gold">CTD</Pill>}{!rate.stopSell && !rate.closedToArrival && !rate.closedToDeparture && <Pill tone="green">Open</Pill>}</div></td></tr>)}</tbody></table></div>
      {!snapshot.dailyRates.length && <Empty body="No overrides yet. Public pricing falls back to each villa's base rate." />}
    </section>
  </div>;

  const renderFinance = () => <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(380px,1.15fr)]">
    <section className="min-w-0 border border-[#d2d0c7] bg-white">
      <div className="border-b border-[#dedcd4] px-5 py-4"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Guest accounts</p><h2 className="mt-1 font-serif text-2xl">Open folios</h2></div>
      <div className="max-h-[680px] overflow-y-auto divide-y divide-[#e5e3dc]">{snapshot.folios.map((folio) => <button key={folio.folioId} onClick={() => setSelectedFolioId(folio.folioId)} className={`grid w-full grid-cols-[1fr_auto] gap-4 px-5 py-4 text-left transition ${selectedFolio?.folioId === folio.folioId ? "bg-[#edf2ed]" : "hover:bg-[#faf9f5]"}`}><div><p className="font-medium">{folio.guestName}</p><p className="mt-1 font-mono text-[10px] text-[#77827a]">{folio.bookingCode} · {folio.villaName}</p></div><div className="text-right"><p className={`font-medium ${folio.balance > 0 ? "text-[#9a4b38]" : "text-[#2e6842]"}`}>{money(folio.balance)}</p><p className="mt-1 text-[9px] tracking-[0.1em] text-[#7c867f] uppercase">balance</p></div></button>)}</div>
    </section>
    <section className="border border-[#d2d0c7] bg-white">
      {selectedFolio ? <>
        <div className="flex flex-col gap-3 border-b border-[#dedcd4] bg-[#193126] p-5 text-white sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] text-[#a8b9ae]">{selectedFolio.bookingCode}</p><h2 className="mt-1 font-serif text-2xl">{selectedFolio.guestName}</h2><p className="mt-2 text-xs text-[#aebdb3]">{selectedFolio.villaName} · {selectedFolio.status.replaceAll("_", " ")}</p></div><div className="text-left sm:text-right"><p className="text-[9px] tracking-[0.12em] text-[#a8b9ae] uppercase">Balance due</p><p className="mt-1 font-serif text-3xl">{money(selectedFolio.balance)}</p></div></div>
        <div className="max-h-72 overflow-y-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f1efe9] text-[9px] tracking-[0.11em] text-[#758078] uppercase"><tr><th className="px-4 py-3">Entry</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th></tr></thead><tbody className="divide-y divide-[#e5e3dc]">{selectedFolio.entries.map((entry) => <tr key={entry.id}><td className="px-4 py-3"><p>{entry.description}</p><p className="mt-1 text-[9px] tracking-[0.1em] text-[#7b857e] uppercase">{entry.entryType.replaceAll("_", " ")} · {date(entry.serviceDate)}</p></td><td className="px-4 py-3 text-right">{entry.debit ? money(entry.debit) : "—"}</td><td className="px-4 py-3 text-right text-[#326145]">{entry.credit ? money(entry.credit) : "—"}</td></tr>)}</tbody></table></div>
        <div className="grid gap-5 border-t border-[#dedcd4] bg-[#f8f7f2] p-5 lg:grid-cols-3">
          <form onSubmit={(event) => submit(event, postFolioCharge, true)} className="space-y-3"><input type="hidden" name="bookingId" value={selectedFolio.bookingId} /><p className="text-[10px] font-semibold tracking-[0.11em] uppercase">Post charge</p><input name="description" required placeholder="Minibar, transport…" className={inputClass} /><input name="amount" type="number" min="1" required placeholder="Amount" className={inputClass} /><button disabled={!snapshot.permissions.finance || isPending} className={`${buttonClass} w-full`}>Add charge</button></form>
          <form onSubmit={(event) => submit(event, postManualPayment, true)} className="space-y-3"><input type="hidden" name="bookingId" value={selectedFolio.bookingId} /><p className="text-[10px] font-semibold tracking-[0.11em] uppercase">Record payment</p><select name="method" className={inputClass}><option>CASH</option><option>BANK_TRANSFER</option><option>CARD</option><option>OTHER</option></select><input name="amount" type="number" min="1" required defaultValue={Math.max(0, selectedFolio.balance)} className={inputClass} /><button disabled={!snapshot.permissions.finance || isPending} className={`${buttonClass} w-full`}>Post payment</button></form>
          <form onSubmit={(event) => submit(event, postRefund, true)} className="space-y-3"><input type="hidden" name="bookingId" value={selectedFolio.bookingId} /><p className="text-[10px] font-semibold tracking-[0.11em] uppercase">Record refund</p><input name="reason" required placeholder="Approved reason" className={inputClass} /><input name="amount" type="number" min="1" required placeholder="Amount" className={inputClass} /><button disabled={!snapshot.permissions.finance || isPending} className="h-11 w-full border border-[#b96f5c] px-4 text-[10px] font-semibold tracking-[0.12em] text-[#8b3f2f] uppercase disabled:opacity-45">Record refund</button></form>
        </div>
        <div className="border-t border-[#dedcd4] px-5 py-3 text-right"><Link href={`/admin/invoices/${selectedFolio.bookingId}`} target="_blank" className="text-[10px] font-semibold tracking-[0.12em] text-[#315b45] uppercase">Open printable invoice →</Link></div>
      </> : <Empty body="No folios have been created yet." />}
    </section>
  </div>;

  const renderMaintenance = () => <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
    <section className="border border-[#d2d0c7] bg-white p-5"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Engineering queue</p><h2 className="mt-1 font-serif text-2xl">Report an issue</h2>
      <form onSubmit={(event) => submit(event, createMaintenanceTicket, true)} className="mt-6 space-y-4">
        <Field label="Room"><select name="roomUnitId" className={inputClass}>{snapshot.roomUnits.map((room) => <option key={room.id} value={room.id}>{room.code} · {room.villaName}</option>)}</select></Field>
        <Field label="Issue title"><input name="title" required className={inputClass} placeholder="Air conditioning inspection" /></Field>
        <Field label="Description"><textarea name="description" className="mt-2 min-h-24 w-full border border-[#cbc9c0] bg-white p-3 text-sm outline-none focus:border-[#315b45]" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Priority"><select name="priority" className={inputClass}><option>NORMAL</option><option>HIGH</option><option>URGENT</option><option>LOW</option></select></Field><Field label="Assign to"><input name="assignedTo" className={inputClass} placeholder="Engineering" /></Field></div>
        <label className="flex items-start gap-3 border border-[#e0d4c9] bg-[#fbf5ed] p-3 text-xs leading-5 text-[#695747]"><input name="blocksInventory" type="checkbox" className="mt-0.5 size-4 accent-[#8b4a36]" /><span><strong>Take room out of order.</strong><br />Blocks this unit from new reservations until resolved.</span></label>
        <button disabled={!snapshot.permissions.maintenance || isPending} className={`${buttonClass} w-full`}>Create ticket</button>
      </form>
    </section>
    <section className="min-w-0 border border-[#d2d0c7] bg-white"><div className="border-b border-[#dedcd4] px-5 py-4"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Work orders</p><h2 className="mt-1 font-serif text-2xl">Open & recent</h2></div>
      <div className="divide-y divide-[#e5e3dc]">{snapshot.maintenance.map((ticket) => <article key={ticket.id} className="grid gap-4 p-5 lg:grid-cols-[110px_1fr_auto]"><div><p className="font-mono text-xs font-semibold">{ticket.ticketCode}</p><p className="mt-2 font-serif text-2xl">{ticket.roomCode}</p><p className="mt-1 text-xs text-[#7b857e]">{ticket.villaName}</p></div><div><div className="flex flex-wrap gap-2"><Pill tone={ticket.priority === "HIGH" || ticket.priority === "URGENT" ? "red" : "gold"}>{ticket.priority}</Pill>{ticket.blocksInventory && <Pill tone="red">Out of order</Pill>}<Pill tone={ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "green" : "neutral"}>{ticket.status.replaceAll("_", " ")}</Pill></div><h3 className="mt-3 font-medium">{ticket.title}</h3><p className="mt-2 text-sm leading-6 text-[#647169]">{ticket.description || "No additional description."}</p><p className="mt-2 text-xs text-[#849087]">{ticket.assignedTo || "Unassigned"} · {date(ticket.createdAt)}</p></div><div className="flex items-start gap-2 lg:flex-col">{ticket.status === "OPEN" && <button disabled={!snapshot.permissions.maintenance || isPending} onClick={() => run(updateMaintenanceTicket({ ticketId: ticket.id, status: "IN_PROGRESS" }))} className="border border-[#9ba99f] px-3 py-2 text-[9px] font-semibold uppercase">Start</button>}{ticket.status === "IN_PROGRESS" && <button disabled={!snapshot.permissions.maintenance || isPending} onClick={() => run(updateMaintenanceTicket({ ticketId: ticket.id, status: "RESOLVED" }))} className="bg-[#244c38] px-3 py-2 text-[9px] font-semibold text-white uppercase">Resolve</button>}{ticket.status === "RESOLVED" && <button disabled={!snapshot.permissions.maintenance || isPending} onClick={() => run(updateMaintenanceTicket({ ticketId: ticket.id, status: "CLOSED" }))} className="border border-[#9ba99f] px-3 py-2 text-[9px] font-semibold uppercase">Close</button>}</div></article>)}</div>
    </section>
  </div>;

  const renderNightAudit = () => <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
    <section className="border border-[#d2d0c7] bg-[#193126] p-6 text-white"><p className="text-[9px] tracking-[0.14em] text-[#a5b6ab] uppercase">End-of-day procedure</p><h2 className="mt-2 font-serif text-3xl">Close with confidence.</h2><p className="mt-4 text-sm leading-6 text-[#b9c6be]">Night audit snapshots occupancy, successful payments, pending arrivals, open departures, and high-priority maintenance. The closed day is immutable through this interface.</p>
      <form onSubmit={(event) => submit(event, runNightAudit)} className="mt-8"><label className="text-[10px] tracking-[0.12em] text-[#a5b6ab] uppercase">Business date<input name="businessDate" type="date" defaultValue={snapshot.today} max={snapshot.today} required className="mt-2 h-12 w-full border border-[#597064] bg-[#213c2e] px-3 text-white" /></label><button disabled={!snapshot.permissions.nightAudit || isPending} className="mt-4 h-12 w-full bg-[#e4d7bf] text-[10px] font-semibold tracking-[0.13em] text-[#193126] uppercase disabled:opacity-45">Run night audit</button></form>
      <div className="mt-7 space-y-3 border-t border-white/10 pt-5 text-xs text-[#aebdb3]">{["Snapshot revenue and occupancy", "Record operational exceptions", "Close selected business day", "Open the next business day", "Write an immutable audit event"].map((item, index) => <p key={item} className="flex gap-3"><span className="font-mono text-[#d6b983]">{String(index + 1).padStart(2, "0")}</span>{item}</p>)}</div>
    </section>
    <section className="border border-[#d2d0c7] bg-white"><div className="border-b border-[#dedcd4] px-5 py-4"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Business-day ledger</p><h2 className="mt-1 font-serif text-2xl">Recent closes</h2></div><div className="divide-y divide-[#e5e3dc]">{snapshot.businessDays.map((day) => { const summary = parseSummary(day.summaryJson); return <article key={day.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[140px_1fr_auto] sm:items-center"><div><p className="font-medium">{date(day.date)}</p><p className="mt-1 text-[9px] tracking-[0.1em] text-[#7c867f] uppercase">{day.status}</p></div><div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><span><b className="block font-serif text-lg">{String(summary?.occupiedNights ?? "—")}</b>room nights</span><span><b className="block font-serif text-lg">{String(summary?.occupancyPercent ?? "—")}%</b>occupancy</span><span className="col-span-2"><b className="block font-serif text-lg">{typeof summary?.paymentRevenue === "number" ? money(summary.paymentRevenue, true) : "—"}</b>payments</span></div><Pill tone={day.audited ? "green" : "gold"}>{day.audited ? "Audited" : "Open"}</Pill></article>; })}</div></section>
  </div>;

  const renderReports = () => {
    const maxSource = Math.max(1, ...snapshot.report.sourceCounts.map((item) => item.count));
    const maxPayment = Math.max(1, ...paymentByDay.map(([, amount]) => amount));
    return <div className="grid gap-5 xl:grid-cols-2">
      <section className="border border-[#d2d0c7] bg-white p-5"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">30-day revenue</p><h2 className="mt-1 font-serif text-2xl">Payment pace</h2><div className="mt-8 flex h-56 items-end gap-2 border-b border-[#d9d7cf]">{paymentByDay.map(([day, amount]) => <div key={day} className="group flex min-w-7 flex-1 flex-col items-center justify-end"><span className="mb-2 text-[8px] opacity-0 group-hover:opacity-100">{money(amount, true)}</span><div className="w-full bg-[#c09a5d]" style={{ height: `${Math.max(4, (amount / maxPayment) * 170)}px` }} /><span className="mt-2 text-[8px] text-[#7c867f]">{day.slice(8)}</span></div>)}</div>{!paymentByDay.length && <p className="mt-6 text-sm text-[#7c867f]">No successful payment transactions in this window.</p>}</section>
      <section className="border border-[#d2d0c7] bg-white p-5"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Booking acquisition</p><h2 className="mt-1 font-serif text-2xl">Source mix</h2><div className="mt-7 space-y-5">{snapshot.report.sourceCounts.map((item) => <div key={item.label}><div className="flex justify-between text-xs"><span>{item.label.replaceAll("_", " ")}</span><b>{item.count}</b></div><div className="mt-2 h-2 bg-[#ece9e1]"><div className="h-full bg-[#315b45]" style={{ width: `${(item.count / maxSource) * 100}%` }} /></div></div>)}</div></section>
      <section className="border border-[#d2d0c7] bg-white p-5 xl:col-span-2"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Reservation portfolio</p><h2 className="mt-1 font-serif text-2xl">Status distribution</h2></div><div className="flex gap-4 text-xs"><a href="/api/admin/reports/reservations.csv" className="font-semibold text-[#315b45]">Reservations CSV ↓</a><a href="/api/admin/reports/revenue.csv" className="font-semibold text-[#315b45]">Revenue CSV ↓</a></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{snapshot.report.statusCounts.map((item) => <article key={item.label} className="border border-[#dedbd2] bg-[#f8f7f2] p-4"><p className="font-serif text-3xl">{item.count}</p><p className="mt-2 text-[9px] tracking-[0.12em] text-[#738078] uppercase">{item.label.replaceAll("_", " ")}</p></article>)}</div></section>
    </div>;
  };

  const renderMigration = () => <div className="space-y-5">
    <section className="grid border border-[#d2d0c7] bg-white lg:grid-cols-2">
      <div className="border-b border-[#dedcd4] p-6 lg:border-b-0 lg:border-r"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">01 · Dry-run first</p><h2 className="mt-1 font-serif text-2xl">Stage QloApps bookings</h2><p className="mt-3 text-sm leading-6 text-[#657169]">Upload the documented CSV export. VillaOS validates dates, status, villa mapping, capacities, and external IDs without changing live reservations.</p><form onSubmit={(event) => submit(event, stageQloAppsCsv, true)} className="mt-5"><input name="file" type="file" accept=".csv,text/csv" required className="block w-full border border-dashed border-[#aeb6af] bg-[#f8f7f2] p-4 text-xs" /><div className="mt-4 flex items-center justify-between"><a href="/templates/qloapps-bookings-import.csv" download className="text-[10px] font-semibold tracking-[0.1em] text-[#315b45] uppercase">Download template ↓</a><button disabled={!snapshot.permissions.migration || isPending} className={buttonClass}>Run dry-run</button></div></form></div>
      <div className="p-6"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">02 · Controlled cutover</p><h2 className="mt-1 font-serif text-2xl">Operating mode</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><SettingForm label="Migration mode" settingKey="migration.mode" value={settings["migration.mode"] ?? "SHADOW"} options={["SHADOW", "VILLAOS_PRIMARY", "QLOAPPS_ROLLBACK"]} disabled={!snapshot.permissions.migration || isPending} onSubmit={(data) => run(updateOperationalSetting(data))} /><SettingForm label="Pilot status" settingKey="cutover.pilot_status" value={settings["cutover.pilot_status"] ?? "NOT_STARTED"} options={["NOT_STARTED", "PILOT", "READY", "COMPLETED", "ROLLED_BACK"]} disabled={!snapshot.permissions.migration || isPending} onSubmit={(data) => run(updateOperationalSetting(data))} /></div><div className="mt-5 border-l-2 border-[#c09a5d] bg-[#fbf6eb] p-4 text-xs leading-5 text-[#6b5a43]">Shadow mode keeps QloApps as the operational comparison source. VillaOS Primary should only be selected after reconciliation, staff training, backup verification, and a signed cutover decision.</div></div>
    </section>
    <section className="border border-[#d2d0c7] bg-white"><div className="border-b border-[#dedcd4] px-5 py-4"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Import history</p><h2 className="mt-1 font-serif text-2xl">Reconciliation batches</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#f1efe9] text-[9px] tracking-[0.11em] text-[#758078] uppercase"><tr><th className="px-4 py-3">File</th><th className="px-4 py-3">Rows</th><th className="px-4 py-3">Validation</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Exceptions</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#e5e3dc]">{snapshot.importBatches.map((batch) => <tr key={batch.id}><td className="px-4 py-4"><p className="font-medium">{batch.fileName}</p><p className="mt-1 text-xs text-[#7c867f]">{dateTime(batch.createdAt)}</p></td><td className="px-4 py-4">{batch.totalRows}</td><td className="px-4 py-4"><span className="text-[#2e6842]">{batch.validRows} valid</span> · <span className="text-[#9a4b38]">{batch.invalidRows} invalid</span></td><td className="px-4 py-4"><Pill tone={batch.status.startsWith("COMMITTED") ? "green" : batch.invalidRows ? "red" : "gold"}>{batch.status.replaceAll("_", " ")}</Pill></td><td className="px-4 py-4 text-xs text-[#6d7871]">{batch.records.slice(0, 2).map((record) => <p key={record.rowNumber}>Row {record.rowNumber}: {record.status.toLowerCase()}</p>)}{!batch.records.length && "None"}</td><td className="px-4 py-4 text-right">{["READY", "STAGED"].includes(batch.status) && batch.invalidRows === 0 ? <button disabled={!snapshot.permissions.migration || isPending} onClick={() => run(commitImportBatch({ batchId: batch.id }))} className="bg-[#244c38] px-3 py-2 text-[9px] font-semibold text-white uppercase">Commit batch</button> : <span className="text-xs text-[#8a928d]">{batch.committedRows} committed</span>}</td></tr>)}</tbody></table></div>{!snapshot.importBatches.length && <Empty body="No dry-run has been staged. Start with the template above." />}</section>
  </div>;

  const renderTeam = () => <div className="grid gap-5 xl:grid-cols-[370px_minmax(0,1fr)]">
    <section className="border border-[#d2d0c7] bg-white p-5"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Least privilege</p><h2 className="mt-1 font-serif text-2xl">Add staff account</h2><form onSubmit={(event) => submit(event, createStaffUser, true)} className="mt-6 space-y-4"><Field label="Full name"><input name="name" required className={inputClass} /></Field><Field label="Email"><input name="email" type="email" required className={inputClass} /></Field><Field label="Role"><select name="role" className={inputClass}>{["MANAGER", "FRONT_DESK", "HOUSEKEEPING", "FINANCE", "VIEWER", "OWNER"].map((role) => <option key={role}>{role}</option>)}</select></Field><Field label="Temporary password"><input name="password" type="password" minLength={10} required className={inputClass} placeholder="10+ chars, letters + numbers" /></Field><button disabled={!snapshot.permissions.staff || isPending} className={`${buttonClass} w-full`}>Create staff account</button></form></section>
    <section className="border border-[#d2d0c7] bg-white"><div className="border-b border-[#dedcd4] px-5 py-4"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Role-based access</p><h2 className="mt-1 font-serif text-2xl">Current team</h2></div><div className="divide-y divide-[#e5e3dc]">{snapshot.staffUsers.map((user) => <article key={user.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center border border-[#bfc6c0] bg-[#f4f5f1] font-serif text-xl">{user.name.slice(0, 1).toUpperCase()}</span><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{user.name}</p><Pill tone={user.active ? "green" : "red"}>{user.active ? "Active" : "Inactive"}</Pill><Pill tone="neutral">{user.role.replaceAll("_", " ")}</Pill></div><p className="mt-1 text-sm text-[#68746c]">{user.email}</p><p className="mt-2 text-xs text-[#89918c]">Last login: {user.lastLoginAt ? dateTime(user.lastLoginAt) : "Never"}</p></div></div><div className="flex flex-wrap gap-2"><form onSubmit={(event) => submit(event, resetStaffPassword, true)} className="flex gap-2"><input type="hidden" name="userId" value={user.id} /><input name="password" type="password" minLength={10} required placeholder="New password" className="h-9 w-36 border border-[#c9c7be] px-2 text-xs" /><button disabled={!snapshot.permissions.staff || isPending} className="border border-[#9ba99f] px-3 text-[9px] font-semibold uppercase">Reset</button></form><button disabled={!snapshot.permissions.staff || isPending || user.id === snapshot.staff.id} onClick={() => run(setStaffActive({ userId: user.id, active: !user.active }))} className="border border-[#c8a9a1] px-3 text-[9px] font-semibold text-[#8b4534] uppercase disabled:opacity-35">{user.active ? "Disable" : "Enable"}</button></div></article>)}</div></section>
  </div>;

  const renderSystem = () => <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
    <div className="space-y-5"><section className="border border-[#d2d0c7] bg-white p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Recovery point</p><h2 className="mt-1 font-serif text-2xl">Local database backup</h2></div><span className="size-2 bg-[#5f9b70]" /></div><p className="mt-3 text-sm leading-6 text-[#66726a]">Creates a timestamped SQLite copy with SHA-256 checksum. Production PostgreSQL backups are configured at the database provider.</p><button disabled={!snapshot.permissions.backup || isPending} onClick={() => run(runLocalBackup())} className={`${buttonClass} mt-5 w-full`}>Run verified backup</button><div className="mt-5 space-y-3 border-t border-[#dedcd4] pt-4">{snapshot.backups.map((backup) => <div key={backup.id} className="text-xs"><div className="flex items-center justify-between"><span>{dateTime(backup.createdAt)}</span><Pill tone={backup.status === "COMPLETED" ? "green" : backup.status === "FAILED" ? "red" : "gold"}>{backup.status}</Pill></div><p className="mt-1 truncate text-[#7c867f]">{backup.location?.split("/").pop() ?? "No file"}{backup.sizeBytes ? ` · ${(backup.sizeBytes / 1024).toFixed(0)} KB` : ""}</p></div>)}</div></section>
      <section className="border border-[#d2d0c7] bg-[#193126] p-5 text-white"><p className="text-[9px] tracking-[0.14em] text-[#a5b6ab] uppercase">Runtime health</p><div className="mt-4 flex items-center justify-between"><div><p className="font-serif text-2xl">VillaOS local</p><p className="mt-1 text-xs text-[#aebdb3]">Database, inventory, and operator workspace</p></div><a href="/api/health" target="_blank" className="border border-[#72897b] px-3 py-2 text-[9px] font-semibold tracking-[0.1em] uppercase">Health JSON ↗</a></div></section></div>
    <section className="border border-[#d2d0c7] bg-white"><div className="border-b border-[#dedcd4] px-5 py-4"><p className="text-[9px] tracking-[0.14em] text-[#78847c] uppercase">Immutable activity</p><h2 className="mt-1 font-serif text-2xl">Audit trail</h2></div><div className="max-h-[760px] overflow-y-auto divide-y divide-[#e5e3dc]">{snapshot.auditLogs.map((log) => <article key={log.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[150px_1fr_auto] sm:items-center"><p className="text-xs text-[#748078]">{dateTime(log.createdAt)}</p><div><p className="text-sm font-medium">{log.action.replaceAll("_", " ")}</p><p className="mt-1 font-mono text-[9px] text-[#849087]">{log.entityType} {log.entityId ? `· ${log.entityId.slice(0, 12)}` : ""}</p></div><p className="text-xs text-[#647169]">{log.actorName}</p></article>)}</div>{!snapshot.auditLogs.length && <Empty body="Audit events appear after authenticated operational changes." />}</section>
  </div>;

  const renderSection = () => ({ overview: renderOverview, rates: renderRates, finance: renderFinance, maintenance: renderMaintenance, "night-audit": renderNightAudit, reports: renderReports, migration: renderMigration, team: renderTeam, system: renderSystem }[section])();

  return <div className="min-h-svh bg-[#f3f1eb] text-[#172b21]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col bg-[#152b21] text-white lg:flex"><div className="border-b border-white/10 p-5"><Link href="/admin" className="flex items-center gap-3"><span className="grid size-10 place-items-center border border-[#8ca093] font-serif text-lg">V</span><div><p className="font-serif text-xl leading-none">VillaOS</p><p className="mt-1 text-[8px] tracking-[0.19em] text-[#91a799] uppercase">Control center</p></div></Link></div><nav className="flex-1 overflow-y-auto p-3" aria-label="Control center sections">{(Object.keys(SECTION_META) as Section[]).map((id) => { const item = SECTION_META[id]; return <button key={id} onClick={() => setSection(id)} className={`mb-1 flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition ${section === id ? "bg-[#294738] text-white" : "text-[#bdc9c1] hover:bg-white/5"}`}><span className={`grid size-5 place-items-center border text-[8px] ${section === id ? "border-[#97ad9f]" : "border-[#4a6254]"}`}>{item.number}</span><span>{item.label}</span></button>; })}</nav><div className="border-t border-white/10 p-4"><div className="border border-white/10 bg-white/5 p-3"><p className="truncate text-xs font-medium">{snapshot.staff.name}</p><p className="mt-1 text-[9px] tracking-[0.1em] text-[#8fa396] uppercase">{snapshot.staff.role.replaceAll("_", " ")}</p></div><Link href="/admin" className="mt-3 block px-3 py-2 text-[9px] tracking-[0.12em] text-[#91a799] uppercase hover:text-white">← Operations desk</Link></div></aside>
    <div className="lg:pl-[252px]"><header className="sticky top-0 z-20 border-b border-[#d7d5cc] bg-[#f3f1eb]/95 backdrop-blur"><div className="flex h-20 items-center justify-between px-4 sm:px-6 lg:px-8"><div><p className="text-[9px] font-semibold tracking-[0.18em] text-[#7d877f] uppercase">{SECTION_META[section].eyebrow}</p><h1 className="mt-1 font-serif text-2xl leading-none">{SECTION_META[section].title}</h1></div><div className="text-right"><p className="text-xs font-medium">The Taru Villas</p><p className="mt-1 text-[9px] tracking-[0.11em] text-[#7b857e] uppercase">{snapshot.today} · Local mode</p></div></div><nav className="flex overflow-x-auto border-t border-[#dedbd2] px-3 lg:hidden">{(Object.keys(SECTION_META) as Section[]).map((id) => <button key={id} onClick={() => setSection(id)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs ${section === id ? "border-[#244c38] font-semibold text-[#244c38]" : "border-transparent text-[#77827a]"}`}>{SECTION_META[id].label}</button>)}</nav></header><main className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{renderSection()}</main></div>
    {toast && <div className={`fixed bottom-5 right-5 z-[70] max-w-sm border px-4 py-3 text-sm shadow-xl ${toast.ok ? "border-[#7aa188] bg-[#e8f3eb] text-[#285d3b]" : "border-[#d3a296] bg-[#faebe7] text-[#853e2f]"}`}>{toast.message}</div>}{isPending && <div className="fixed inset-x-0 top-0 z-[80] h-0.5 animate-pulse bg-[#c19a5b]" />}
  </div>;
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "green" | "gold" | "red" | "neutral" }) {
  const styles = { green: "border-[#8eb49b] bg-[#edf7ef] text-[#285d3b]", gold: "border-[#d3b47b] bg-[#fff6e4] text-[#76520f]", red: "border-[#d5aaa0] bg-[#fbefec] text-[#8a3d2d]", neutral: "border-[#c8c5bd] bg-[#f3f1eb] text-[#626861]" };
  return <span className={`inline-flex border px-2 py-1 text-[9px] font-semibold tracking-[0.08em] uppercase ${styles[tone]}`}>{children}</span>;
}

function Empty({ body }: { body: string }) {
  return <div className="m-5 border border-dashed border-[#c8c6bd] bg-[#faf9f5] px-6 py-10 text-center text-sm text-[#748078]">{body}</div>;
}

function SettingForm({ label, settingKey, value, options, disabled, onSubmit }: { label: string; settingKey: string; value: string; options: string[]; disabled: boolean; onSubmit: (data: FormData) => void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }} className="border border-[#dedbd2] bg-[#f8f7f2] p-4"><input type="hidden" name="key" value={settingKey} /><p className="text-[9px] font-semibold tracking-[0.11em] text-[#748078] uppercase">{label}</p><select name="value" defaultValue={value} className={inputClass}>{options.map((option) => <option key={option}>{option}</option>)}</select><button disabled={disabled} className="mt-3 h-9 w-full border border-[#315b45] text-[9px] font-semibold tracking-[0.1em] text-[#315b45] uppercase disabled:opacity-40">Apply mode</button></form>;
}
