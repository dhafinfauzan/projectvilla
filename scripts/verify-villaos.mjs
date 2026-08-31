import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const failures = [];
const checks = [];

async function check(name, test) {
  try {
    const detail = await test();
    checks.push({ name, ok: true, detail });
  } catch (error) {
    failures.push({ name, error: error instanceof Error ? error.message : String(error) });
  }
}

await check("active owner exists", async () => {
  const count = await prisma.staffUser.count({ where: { role: "OWNER", active: true } });
  if (!count) throw new Error("no active OWNER account");
  return `${count} owner account(s)`;
});

await check("physical inventory matches villa totals", async () => {
  const villas = await prisma.villa.findMany({ include: { _count: { select: { roomUnits: true } } } });
  const mismatches = villas.filter((villa) => villa.totalUnits !== villa._count.roomUnits);
  if (mismatches.length) throw new Error(mismatches.map((villa) => villa.slug).join(", "));
  return `${villas.length} villa types aligned`;
});

await check("active bookings own every room-night", async () => {
  const active = await prisma.booking.findMany({ where: { status: { in: ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"] } }, include: { inventoryNights: true } });
  const missing = active.filter((booking) => booking.inventoryNights.length !== booking.nights);
  if (missing.length) throw new Error(missing.map((booking) => booking.bookingCode).join(", "));
  return `${active.length} active reservations covered`;
});

await check("folio room charges match reservation totals", async () => {
  const bookings = await prisma.booking.findMany({ include: { folio: { include: { entries: { where: { entryType: "ROOM_CHARGE", voidedAt: null } } } } } });
  const mismatch = bookings.filter((booking) => booking.folio && booking.folio.entries.reduce((sum, entry) => sum + entry.debit, 0) !== booking.totalAmount);
  if (mismatch.length) throw new Error(mismatch.map((booking) => booking.bookingCode).join(", "));
  return `${bookings.length} reservations checked`;
});

await check("operational settings exist", async () => {
  const keys = await prisma.systemSetting.findMany({ select: { key: true } });
  for (const required of ["migration.mode", "cutover.pilot_status", "property.timezone", "property.currency"]) {
    if (!keys.some((item) => item.key === required)) throw new Error(`missing ${required}`);
  }
  return `${keys.length} settings available`;
});

for (const item of checks) process.stdout.write(`PASS  ${item.name}: ${item.detail}\n`);
for (const item of failures) process.stderr.write(`FAIL  ${item.name}: ${item.error}\n`);
await prisma.$disconnect();
if (failures.length) process.exit(1);
