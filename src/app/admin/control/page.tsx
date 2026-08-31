import { redirect } from "next/navigation";
import { dateKey, utcBusinessDate } from "@/lib/dates";
import { getCurrentStaff, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import ControlCenter, { type ControlSnapshot } from "./ControlCenter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Control Center — VillaOS",
  description: "VillaOS commercial, financial, migration, and system controls.",
  robots: { index: false, follow: false },
};

export default async function ControlCenterPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin");

  const today = utcBusinessDate(new Date());
  const inThirtyDays = new Date(today.getTime() + 30 * 86_400_000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000);
  const [
    villas,
    roomUnits,
    bookings,
    dailyRates,
    maintenance,
    businessDays,
    importBatches,
    staffUsers,
    auditLogs,
    settings,
    backups,
    occupiedToday,
    payments30,
    sourceCounts,
    statusCounts,
    forecastNights,
    mappingCount,
  ] = await Promise.all([
    prisma.villa.findMany({ orderBy: { pricePerNight: "asc" } }),
    prisma.roomUnit.findMany({ include: { villa: true }, orderBy: [{ villa: { pricePerNight: "asc" } }, { code: "asc" }] }),
    prisma.booking.findMany({
      include: { villa: true, assignedUnit: true, folio: { include: { entries: { where: { voidedAt: null }, orderBy: { createdAt: "asc" } } } }, payments: true },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    prisma.dailyRate.findMany({
      where: { businessDate: { gte: today, lt: inThirtyDays } },
      include: { villa: true, ratePlan: true },
      orderBy: [{ businessDate: "asc" }, { villa: { pricePerNight: "asc" } }],
    }),
    prisma.maintenanceTicket.findMany({ include: { roomUnit: { include: { villa: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 }),
    prisma.businessDay.findMany({ include: { nightAuditRun: true }, orderBy: { businessDate: "desc" }, take: 14 }),
    prisma.importBatch.findMany({ include: { records: { where: { status: { in: ["INVALID", "CONFLICT"] } }, orderBy: { rowNumber: "asc" }, take: 20 } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.staffUser.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.auditLog.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 120 }),
    prisma.systemSetting.findMany({ orderBy: { key: "asc" } }),
    prisma.backupRun.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.bookingNight.count({ where: { stayDate: today, booking: { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } } } }),
    prisma.paymentTransaction.findMany({ where: { status: "SUCCEEDED", occurredAt: { gte: thirtyDaysAgo }, type: "PAYMENT" }, orderBy: { occurredAt: "asc" } }),
    prisma.booking.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.bookingNight.groupBy({ by: ["stayDate"], where: { stayDate: { gte: today, lt: inThirtyDays }, booking: { status: { in: ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"] } } }, _count: { _all: true }, orderBy: { stayDate: "asc" } }),
    prisma.externalIdMapping.count({ where: { source: "QLOAPPS" } }),
  ]);

  const folios = bookings
    .filter((booking) => booking.folio)
    .map((booking) => {
      const entries = booking.folio!.entries;
      const debit = entries.reduce((sum, entry) => sum + entry.debit, 0);
      const credit = entries.reduce((sum, entry) => sum + entry.credit, 0);
      return {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        guestName: booking.guestName,
        villaName: booking.villa.name,
        status: booking.status,
        folioId: booking.folio!.id,
        folioStatus: booking.folio!.status,
        debit,
        credit,
        balance: debit - credit,
        entries: entries.map((entry) => ({
          id: entry.id,
          entryType: entry.entryType,
          description: entry.description,
          debit: entry.debit,
          credit: entry.credit,
          serviceDate: entry.serviceDate.toISOString(),
        })),
      };
    });

  const snapshot: ControlSnapshot = {
    generatedAt: new Date().toISOString(),
    today: dateKey(new Date()),
    staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
    permissions: {
      rates: hasPermission(staff.role, "rates:write"),
      finance: hasPermission(staff.role, "finance:write"),
      maintenance: hasPermission(staff.role, "maintenance:write"),
      nightAudit: hasPermission(staff.role, "night_audit:run"),
      migration: hasPermission(staff.role, "migration:manage"),
      staff: hasPermission(staff.role, "staff:manage"),
      audit: hasPermission(staff.role, "audit:read"),
      backup: hasPermission(staff.role, "backup:run"),
    },
    stats: {
      totalRooms: roomUnits.length,
      occupiedToday,
      occupancyPercent: roomUnits.length ? Math.round((occupiedToday / roomUnits.length) * 100) : 0,
      revenue30: payments30.reduce((sum, payment) => sum + payment.amount, 0),
      outstanding: folios.reduce((sum, folio) => sum + Math.max(0, folio.balance), 0),
      openMaintenance: maintenance.filter((ticket) => ["OPEN", "IN_PROGRESS"].includes(ticket.status)).length,
      qloMappings: mappingCount,
    },
    villas: villas.map((villa) => ({ id: villa.id, slug: villa.slug, name: villa.name, pricePerNight: villa.pricePerNight, totalUnits: villa.totalUnits })),
    roomUnits: roomUnits.map((room) => ({ id: room.id, code: room.code, villaName: room.villa.name, operationalStatus: room.operationalStatus })),
    dailyRates: dailyRates.map((rate) => ({ id: rate.id, villaId: rate.villaId, villaName: rate.villa.name, date: rate.businessDate.toISOString(), price: rate.price, minStay: rate.minStay, stopSell: rate.stopSell, closedToArrival: rate.closedToArrival, closedToDeparture: rate.closedToDeparture })),
    folios,
    maintenance: maintenance.map((ticket) => ({ id: ticket.id, ticketCode: ticket.ticketCode, roomCode: ticket.roomUnit.code, villaName: ticket.roomUnit.villa.name, title: ticket.title, description: ticket.description, priority: ticket.priority, status: ticket.status, blocksInventory: ticket.blocksInventory, assignedTo: ticket.assignedTo, createdAt: ticket.createdAt.toISOString() })),
    businessDays: businessDays.map((day) => ({ id: day.id, date: day.businessDate.toISOString(), status: day.status, closedBy: day.closedBy, summaryJson: day.summaryJson, audited: Boolean(day.nightAuditRun) })),
    importBatches: importBatches.map((batch) => ({ id: batch.id, fileName: batch.fileName, status: batch.status, totalRows: batch.totalRows, validRows: batch.validRows, invalidRows: batch.invalidRows, committedRows: batch.committedRows, summaryJson: batch.summaryJson, createdAt: batch.createdAt.toISOString(), records: batch.records.map((record) => ({ rowNumber: record.rowNumber, status: record.status, errorsJson: record.errorsJson })) })),
    staffUsers: staffUsers.map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, lastLoginAt: user.lastLoginAt?.toISOString() ?? null })),
    auditLogs: auditLogs.map((log) => ({ id: log.id, action: log.action, entityType: log.entityType, entityId: log.entityId, actorName: log.actor?.name ?? "System", createdAt: log.createdAt.toISOString() })),
    settings: Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
    backups: backups.map((backup) => ({ id: backup.id, status: backup.status, location: backup.location, sizeBytes: backup.sizeBytes, checksum: backup.checksum, createdBy: backup.createdBy, createdAt: backup.createdAt.toISOString() })),
    report: {
      sourceCounts: sourceCounts.map((item) => ({ label: item.source, count: item._count._all })),
      statusCounts: statusCounts.map((item) => ({ label: item.status, count: item._count._all })),
      forecast: forecastNights.map((item) => ({ date: item.stayDate.toISOString(), occupied: item._count._all, percent: roomUnits.length ? Math.round((item._count._all / roomUnits.length) * 100) : 0 })),
      payments: payments30.map((payment) => ({ date: payment.occurredAt.toISOString(), amount: payment.amount, provider: payment.provider })),
    },
  };

  return <ControlCenter snapshot={snapshot} />;
}
