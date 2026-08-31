import { adminIsConfigured, getCurrentStaff } from "@/lib/admin-auth";
import { expireStaleBookings } from "@/lib/bookings";
import { prisma } from "@/lib/prisma";
import { loginAdmin } from "./actions";
import VillaOSWorkspace, { type AdminSnapshot } from "./VillaOSWorkspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "VillaOS — The Taru Villas",
  description: "Private property operations workspace for The Taru Villas.",
  robots: { index: false, follow: false },
};

async function AdminLogin({ error }: { error?: string }) {
  const configured = await adminIsConfigured();
  return (
    <div className="grid min-h-svh bg-[#13271e] text-[#f5f0e5] lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden border-r border-white/10 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center border border-[#9db3a4] font-serif text-xl">V</span>
          <div><p className="font-serif text-2xl leading-none">VillaOS</p><p className="mt-1 text-[9px] tracking-[0.22em] text-[#91a799] uppercase">Property system</p></div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-[#9fb2a6] uppercase">One property. One truth.</p>
          <h1 className="mt-5 font-serif text-5xl leading-[1.08] xl:text-6xl">The calm side of hotel operations.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#b8c6bd]">Reservations, rooms, payments, and housekeeping aligned around the same business day.</p>
        </div>
        <p className="relative text-[10px] tracking-[0.12em] text-[#718a7b] uppercase">Private staff access · The Taru Villas</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center border border-[#9db3a4] font-serif text-xl">V</span>
            <p className="font-serif text-2xl">VillaOS</p>
          </div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-[#8fa496] uppercase">Staff sign in</p>
          <h2 className="mt-3 font-serif text-4xl">Start your shift</h2>
          <p className="mt-4 text-sm leading-6 text-[#adbbb2]">Use your individual staff account. Your encrypted session stays active for 12 hours on this device.</p>

          {!configured ? (
            <div className="mt-8 border border-[#9b6f5f] bg-[#4a2e26] p-4 text-sm leading-6 text-[#f1cec1]">No active staff account exists. Set ADMIN_EMAIL and ADMIN_KEY, then run the database setup once.</div>
          ) : (
            <form action={loginAdmin} className="mt-8">
              <label htmlFor="staff-email" className="text-[10px] font-semibold tracking-[0.14em] text-[#a7b6ad] uppercase">Email</label>
              <input id="staff-email" name="email" type="email" autoComplete="username" required autoFocus className="mt-2 h-12 w-full border border-[#52695b] bg-[#1a3126] px-4 text-white outline-none transition placeholder:text-[#60776a] focus:border-[#a9bba8]" placeholder="admin@thetaruvillas.local" />
              <label htmlFor="staff-password" className="mt-5 block text-[10px] font-semibold tracking-[0.14em] text-[#a7b6ad] uppercase">Password</label>
              <input id="staff-password" name="password" type="password" autoComplete="current-password" required className="mt-2 h-12 w-full border border-[#52695b] bg-[#1a3126] px-4 text-white outline-none transition placeholder:text-[#60776a] focus:border-[#a9bba8]" placeholder="Your staff password" />
              {error === "invalid-credentials" && <p className="mt-3 text-sm text-[#e5a792]">Email or password is not valid.</p>}
              {error === "locked" && <p className="mt-3 text-sm text-[#e5a792]">Account temporarily locked. Try again in 15 minutes.</p>}
              <button className="mt-5 h-12 w-full bg-[#e8deca] text-xs font-semibold tracking-[0.14em] text-[#1b3025] uppercase transition hover:bg-white">Open VillaOS</button>
            </form>
          )}
          <p className="mt-8 text-xs leading-5 text-[#758b7d]">Access is intentionally isolated from the guest website. All operational writes are validated on the server.</p>
        </div>
      </section>
    </div>
  );
}
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const staff = await getCurrentStaff();
  if (!staff) return <AdminLogin error={error} />;

  await expireStaleBookings();

  const [bookings, roomUnits, villas, tasks] = await Promise.all([
    prisma.booking.findMany({
      include: { villa: true, assignedUnit: true },
      orderBy: [{ checkIn: "asc" }, { createdAt: "desc" }],
    }),
    prisma.roomUnit.findMany({
      include: { villa: true },
      orderBy: [{ villa: { pricePerNight: "asc" } }, { code: "asc" }],
    }),
    prisma.villa.findMany({ orderBy: { pricePerNight: "asc" } }),
    prisma.housekeepingTask.findMany({
      include: { roomUnit: { include: { villa: true } } },
      orderBy: [{ businessDate: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
      take: 100,
    }),
  ]);

  const snapshot: AdminSnapshot = {
    generatedAt: new Date().toISOString(),
    staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
    bookings: bookings.map((booking) => ({
      id: booking.id,
      bookingCode: booking.bookingCode,
      villaId: booking.villaId,
      villaName: booking.villa.name,
      checkIn: booking.checkIn.toISOString(),
      checkOut: booking.checkOut.toISOString(),
      guests: booking.guests,
      guestName: booking.guestName,
      email: booking.email,
      phone: booking.phone,
      specialRequests: booking.specialRequests,
      internalNotes: booking.internalNotes,
      nights: booking.nights,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      status: booking.status,
      source: booking.source,
      paymentProvider: booking.paymentProvider,
      assignedUnitId: booking.assignedUnitId,
      assignedUnitCode: booking.assignedUnit?.code ?? null,
      createdAt: booking.createdAt.toISOString(),
    })),
    roomUnits: roomUnits.map((unit) => ({
      id: unit.id,
      villaId: unit.villaId,
      villaName: unit.villa.name,
      code: unit.code,
      floor: unit.floor,
      operationalStatus: unit.operationalStatus,
      housekeepingStatus: unit.housekeepingStatus,
    })),
    villas: villas.map((villa) => ({
      id: villa.id,
      name: villa.name,
      pricePerNight: villa.pricePerNight,
      maxGuests: villa.maxGuests,
      totalUnits: villa.totalUnits,
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      roomUnitId: task.roomUnitId,
      roomCode: task.roomUnit.code,
      villaName: task.roomUnit.villa.name,
      businessDate: task.businessDate.toISOString(),
      taskType: task.taskType,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee,
      note: task.note,
    })),
  };

  return <VillaOSWorkspace snapshot={snapshot} />;
}
