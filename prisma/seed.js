const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt}$${hash.toString("hex")}`;
}

function stayDates(checkIn, checkOut) {
  const start = new Date(Date.UTC(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate()));
  const end = new Date(Date.UTC(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate()));
  const dates = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += 86400000) {
    dates.push(new Date(cursor));
  }
  return dates;
}

const villas = [
  {
    slug: "taru-garden-villa",
    name: "Taru Garden Villa",
    pricePerNight: 4200000,
    maxGuests: 2,
    bedrooms: 1,
    sizeSqm: 120,
    totalUnits: 6,
  },
  {
    slug: "taru-river-villa",
    name: "Taru River Villa",
    pricePerNight: 6800000,
    maxGuests: 4,
    bedrooms: 2,
    sizeSqm: 210,
    totalUnits: 4,
  },
  {
    slug: "taru-sky-estate",
    name: "Taru Sky Estate",
    pricePerNight: 12500000,
    maxGuests: 6,
    bedrooms: 3,
    sizeSqm: 380,
    totalUnits: 2,
  },
];

async function main() {
  const villaBySlug = new Map();
  const seedDemo = process.env.SEED_DEMO_DATA !== "false";

  const adminPassword = process.env.ADMIN_KEY;
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@thetaruvillas.local").toLowerCase();
  if (adminPassword) {
    await prisma.staffUser.upsert({
      where: { email: adminEmail },
      update: {
        name: process.env.ADMIN_NAME || "VillaOS Owner",
        role: "OWNER",
        active: true,
        passwordHash: hashPassword(adminPassword),
      },
      create: {
        email: adminEmail,
        name: process.env.ADMIN_NAME || "VillaOS Owner",
        role: "OWNER",
        passwordHash: hashPassword(adminPassword),
      },
    });
  } else {
    console.warn("ADMIN_KEY is empty; no initial VillaOS staff account was seeded.");
  }

  const baseRatePlan = await prisma.ratePlan.upsert({
    where: { code: "BAR" },
    update: { name: "Best Available Rate", active: true },
    create: {
      code: "BAR",
      name: "Best Available Rate",
      description: "Public flexible rate used by the direct booking engine.",
      refundable: true,
    },
  });

  for (const villa of villas) {
    const saved = await prisma.villa.upsert({
      where: { slug: villa.slug },
      update: villa,
      create: villa,
    });
    villaBySlug.set(villa.slug, saved);
  }

  const unitBlueprints = [
    ["taru-garden-villa", "G", 6, "Garden"],
    ["taru-river-villa", "R", 4, "River"],
    ["taru-sky-estate", "S", 2, "Ridge"],
  ];
  const unitByCode = new Map();

  for (const [slug, prefix, count, floor] of unitBlueprints) {
    const villa = villaBySlug.get(slug);
    for (let index = 1; index <= count; index += 1) {
      const code = `${prefix}-${String(index).padStart(2, "0")}`;
      const unit = await prisma.roomUnit.upsert({
        where: { villaId_code: { villaId: villa.id, code } },
        update: { floor },
        create: { villaId: villa.id, code, floor },
      });
      unitByCode.set(code, unit);
    }
  }

  // Local-only sample operations data. Fixed booking codes make this seed
  // idempotent, and all dates follow the machine's current business date.
  const day = (offset, hour = 14) => {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return date;
  };

  const samples = [
    {
      bookingCode: "TARU-A7K2QM",
      villaSlug: "taru-garden-villa",
      unitCode: "G-01",
      checkIn: day(0),
      checkOut: day(3, 11),
      guestName: "Ayu Putri",
      email: "ayu.putri@example.com",
      phone: "+628123456789",
      guests: 2,
      status: "CONFIRMED",
      source: "DIRECT_WEB",
      paymentProvider: "xendit",
      paymentRef: "demo-xnd-001",
      specialRequests: "Late arrival around 18:30",
    },
    {
      bookingCode: "TARU-R9P4LX",
      villaSlug: "taru-river-villa",
      unitCode: "R-01",
      checkIn: day(-1),
      checkOut: day(2, 11),
      guestName: "Budi Santoso",
      email: "budi.santoso@example.com",
      phone: "+6282212345678",
      guests: 3,
      status: "CHECKED_IN",
      source: "PHONE",
      paymentProvider: "MANUAL",
      paymentRef: "front-desk-001",
      internalNotes: "Airport transfer confirmed for departure.",
    },
    {
      bookingCode: "TARU-H2W8NK",
      villaSlug: "taru-garden-villa",
      unitCode: "G-02",
      checkIn: day(1),
      checkOut: day(3, 11),
      guestName: "Nadia Rahman",
      email: "nadia.rahman@example.com",
      phone: "+628135551212",
      guests: 2,
      status: "PENDING_PAYMENT",
      source: "DIRECT_WEB",
      paymentProvider: "xendit",
      paymentRef: "demo-xnd-002",
    },
    {
      bookingCode: "TARU-M5C3VA",
      villaSlug: "taru-river-villa",
      unitCode: "R-02",
      checkIn: day(-3),
      checkOut: day(0, 11),
      guestName: "Daniel Wong",
      email: "daniel.wong@example.com",
      phone: "+6591234567",
      guests: 2,
      status: "CHECKED_IN",
      source: "DIRECT_WEB",
      paymentProvider: "xendit",
      paymentRef: "demo-xnd-003",
    },
    {
      bookingCode: "TARU-S8J6TR",
      villaSlug: "taru-sky-estate",
      unitCode: "S-01",
      checkIn: day(-5),
      checkOut: day(-1, 11),
      guestName: "Maya Thompson",
      email: "maya.thompson@example.com",
      phone: "+61412345678",
      guests: 5,
      status: "CHECKED_OUT",
      source: "AGENT",
      paymentProvider: "MANUAL",
      paymentRef: "agent-settlement-17",
    },
    {
      bookingCode: "TARU-K3D9YP",
      villaSlug: "taru-sky-estate",
      unitCode: "S-02",
      checkIn: day(4),
      checkOut: day(7, 11),
      guestName: "Rizky Ananda",
      email: "rizky.ananda@example.com",
      phone: "+6287712349876",
      guests: 4,
      status: "CANCELLED",
      source: "DIRECT_WEB",
      paymentProvider: "xendit",
      paymentRef: "demo-xnd-004",
    },
    {
      bookingCode: "TARU-F4N7BZ",
      villaSlug: "taru-garden-villa",
      unitCode: "G-03",
      checkIn: day(5),
      checkOut: day(8, 11),
      guestName: "Siti & Farhan",
      email: "siti.farhan@example.com",
      phone: "+6285288877711",
      guests: 2,
      status: "CONFIRMED",
      source: "WALK_IN",
      paymentProvider: "MANUAL",
      paymentRef: "front-desk-002",
    },
  ];

  for (const sample of seedDemo ? samples : []) {
    const villa = villaBySlug.get(sample.villaSlug);
    const unit = unitByCode.get(sample.unitCode);
    const nights = Math.max(
      1,
      Math.round((sample.checkOut.getTime() - sample.checkIn.getTime()) / 86400000)
    );
    const { villaSlug, unitCode, ...bookingData } = sample;
    const savedBooking = await prisma.booking.upsert({
      where: { bookingCode: sample.bookingCode },
      update: {
        ...bookingData,
        villaId: villa.id,
        assignedUnitId: unit.id,
        nights,
        totalAmount: nights * villa.pricePerNight,
      },
      create: {
        ...bookingData,
        villaId: villa.id,
        assignedUnitId: unit.id,
        nights,
        totalAmount: nights * villa.pricePerNight,
      },
    });

    await prisma.bookingNight.deleteMany({ where: { bookingId: savedBooking.id } });
    if (!["CANCELLED", "EXPIRED", "NO_SHOW"].includes(savedBooking.status)) {
      await prisma.bookingNight.createMany({
        data: stayDates(savedBooking.checkIn, savedBooking.checkOut).map((stayDate) => ({
          bookingId: savedBooking.id,
          roomUnitId: unit.id,
          stayDate,
        })),
      });
    }

    const folio = await prisma.folio.upsert({
      where: { bookingId: savedBooking.id },
      update: {},
      create: { bookingId: savedBooking.id },
    });
    await prisma.folioEntry.upsert({
      where: { externalRef: `ROOM:${savedBooking.id}` },
      update: { debit: savedBooking.totalAmount },
      create: {
        folioId: folio.id,
        entryType: "ROOM_CHARGE",
        description: `Accommodation · ${savedBooking.nights} nights`,
        debit: savedBooking.totalAmount,
        externalRef: `ROOM:${savedBooking.id}`,
        serviceDate: savedBooking.checkIn,
      },
    });
    if (["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(savedBooking.status) && savedBooking.paymentRef) {
      const payment = await prisma.paymentTransaction.upsert({
        where: { providerRef: savedBooking.paymentRef },
        update: { amount: savedBooking.totalAmount, status: "SUCCEEDED" },
        create: {
          bookingId: savedBooking.id,
          folioId: folio.id,
          provider: savedBooking.paymentProvider || "MANUAL",
          providerRef: savedBooking.paymentRef,
          amount: savedBooking.totalAmount,
          method: savedBooking.paymentProvider === "xendit" ? "QRIS" : "MANUAL",
        },
      });
      await prisma.folioEntry.upsert({
        where: { externalRef: `PAYMENT:${payment.providerRef}` },
        update: { credit: payment.amount },
        create: {
          folioId: folio.id,
          entryType: "PAYMENT",
          description: `${payment.provider} payment`,
          credit: payment.amount,
          externalRef: `PAYMENT:${payment.providerRef}`,
        },
      });
    }
  }

  const taskSamples = [
    {
      id: "demo-hk-g04",
      roomCode: "G-04",
      taskType: "TURNOVER",
      status: "OPEN",
      priority: "HIGH",
      assignee: "Komang",
      note: "Prepare allergy-free linen before 14:00.",
      roomStatus: "DIRTY",
    },
    {
      id: "demo-hk-r02",
      roomCode: "R-02",
      taskType: "DEPARTURE",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignee: "Wayan",
      note: "Guest departure expected at 11:00.",
      roomStatus: "CLEANING",
    },
    {
      id: "demo-hk-s01",
      roomCode: "S-01",
      taskType: "INSPECTION",
      status: "DONE",
      priority: "NORMAL",
      assignee: "Made",
      note: "Minibar count requires supervisor review.",
      roomStatus: "CLEAN",
    },
  ];

  for (const task of seedDemo ? taskSamples : []) {
    const unit = unitByCode.get(task.roomCode);
    await prisma.roomUnit.update({
      where: { id: unit.id },
      data: { housekeepingStatus: task.roomStatus },
    });
    await prisma.housekeepingTask.upsert({
      where: { id: task.id },
      update: {
        businessDate: day(0, 8),
        taskType: task.taskType,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee,
        note: task.note,
      },
      create: {
        id: task.id,
        roomUnitId: unit.id,
        businessDate: day(0, 8),
        taskType: task.taskType,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee,
        note: task.note,
      },
    });
  }

  const todayKey = new Date();
  const businessDate = new Date(Date.UTC(todayKey.getFullYear(), todayKey.getMonth(), todayKey.getDate()));
  await prisma.businessDay.upsert({
    where: { businessDate },
    update: {},
    create: { businessDate, status: "OPEN" },
  });

  if (seedDemo) {
    const garden = villaBySlug.get("taru-garden-villa");
    const tomorrow = new Date(businessDate.getTime() + 86400000);
    await prisma.dailyRate.upsert({
      where: {
        villaId_ratePlanId_businessDate: {
          villaId: garden.id,
          ratePlanId: baseRatePlan.id,
          businessDate: tomorrow,
        },
      },
      update: {},
      create: {
        villaId: garden.id,
        ratePlanId: baseRatePlan.id,
        businessDate: tomorrow,
        price: garden.pricePerNight + 350000,
        minStay: 1,
      },
    });

    const maintenanceUnit = unitByCode.get("G-05");
    await prisma.maintenanceTicket.upsert({
      where: { ticketCode: "MNT-DEMO-001" },
      update: {},
      create: {
        ticketCode: "MNT-DEMO-001",
        roomUnitId: maintenanceUnit.id,
        title: "Pool light inspection",
        description: "Intermittent pool light reported during evening room check.",
        priority: "NORMAL",
        status: "OPEN",
        blocksInventory: false,
        reportedBy: "Night shift",
        assignedTo: "Engineering",
      },
    });
  }

  const settings = [
    ["migration.mode", "SHADOW", "QloApps migration operating mode"],
    ["property.timezone", "Asia/Makassar", "Property operational timezone"],
    ["property.currency", "IDR", "Property accounting currency"],
    ["cutover.pilot_status", "NOT_STARTED", "Pilot and cutover readiness"],
  ];
  for (const [key, value, description] of settings) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value, description },
    });
  }

  console.log(
    "Seeded",
    villas.length,
    "villas,",
    unitByCode.size,
    "room units,",
    seedDemo ? samples.length : 0,
    "sample reservations,",
    seedDemo ? taskSamples.length : 0,
    "housekeeping tasks, staff security, rates, folios, and migration controls"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
