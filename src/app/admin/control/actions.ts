"use server";

import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { ROLES, requireStaff, type StaffRole } from "@/lib/admin-auth";
import { writeAudit } from "@/lib/audit";
import { csvObjects } from "@/lib/csv";
import { dateKey, propertyDateTime, utcBusinessDate } from "@/lib/dates";
import { ensureFolioForBooking, recordPayment, recordRefund } from "@/lib/finance";
import { allocateUnitForBooking } from "@/lib/inventory";
import { hashPassword, validatePassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export type ControlActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function success(message: string): ControlActionResult {
  revalidatePath("/admin");
  revalidatePath("/admin/control");
  return { ok: true, message };
}

function failed(message: string): ControlActionResult {
  return { ok: false, message };
}

function money(value: FormDataEntryValue | null): number {
  return Math.round(Number(value ?? 0));
}

export async function setDailyRate(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("rates:write");
    const villaId = String(formData.get("villaId") ?? "");
    const date = String(formData.get("date") ?? "");
    const price = money(formData.get("price"));
    const minStay = Math.max(1, Number(formData.get("minStay") ?? 1));
    const villa = await prisma.villa.findUnique({ where: { id: villaId } });
    const ratePlan = await prisma.ratePlan.findUnique({ where: { code: "BAR" } });
    if (!villa || !ratePlan || !/^\d{4}-\d{2}-\d{2}$/.test(date) || price < 100_000) {
      return failed("Villa, tanggal, atau harga tidak valid.");
    }
    const businessDate = utcBusinessDate(date);
    const existing = await prisma.dailyRate.findUnique({
      where: { villaId_ratePlanId_businessDate: { villaId, ratePlanId: ratePlan.id, businessDate } },
    });
    const updated = await prisma.dailyRate.upsert({
      where: { villaId_ratePlanId_businessDate: { villaId, ratePlanId: ratePlan.id, businessDate } },
      update: {
        price,
        minStay,
        stopSell: formData.get("stopSell") === "on",
        closedToArrival: formData.get("closedToArrival") === "on",
        closedToDeparture: formData.get("closedToDeparture") === "on",
      },
      create: {
        villaId,
        ratePlanId: ratePlan.id,
        businessDate,
        price,
        minStay,
        stopSell: formData.get("stopSell") === "on",
        closedToArrival: formData.get("closedToArrival") === "on",
        closedToDeparture: formData.get("closedToDeparture") === "on",
      },
    });
    await writeAudit({ actor: staff, action: "DAILY_RATE_SET", entityType: "DAILY_RATE", entityId: updated.id, before: existing, after: updated });
    return success(`${villa.name}: rate ${date} diperbarui.`);
  } catch {
    return failed("Gagal menyimpan rate.");
  }
}

export async function postFolioCharge(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("finance:write");
    const bookingId = String(formData.get("bookingId") ?? "");
    const amount = money(formData.get("amount"));
    const description = String(formData.get("description") ?? "").trim();
    if (amount < 1 || !description) return failed("Deskripsi dan nominal charge wajib valid.");
    const folio = await ensureFolioForBooking(bookingId);
    const entry = await prisma.folioEntry.create({
      data: { folioId: folio.id, entryType: "CHARGE", description, debit: amount, createdBy: staff.name },
    });
    await writeAudit({ actor: staff, action: "FOLIO_CHARGE_POSTED", entityType: "FOLIO_ENTRY", entityId: entry.id, after: entry });
    return success("Charge berhasil diposting ke folio.");
  } catch {
    return failed("Gagal memposting charge.");
  }
}

export async function postManualPayment(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("finance:write");
    const bookingId = String(formData.get("bookingId") ?? "");
    const amount = money(formData.get("amount"));
    const method = String(formData.get("method") ?? "CASH").trim().toUpperCase();
    if (amount < 1) return failed("Nominal pembayaran tidak valid.");
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return failed("Reservasi tidak ditemukan.");
    const result = await recordPayment({
      bookingId,
      provider: "MANUAL",
      providerRef: `MANUAL-${booking.bookingCode}-${randomBytes(5).toString("hex")}`,
      amount,
      method,
    });
    if (booking.status === "PENDING_PAYMENT" && amount >= booking.totalAmount) {
      await prisma.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
    }
    await writeAudit({ actor: staff, action: "PAYMENT_RECORDED", entityType: "PAYMENT", entityId: result.payment.id, after: result.payment });
    return success("Pembayaran manual tercatat di ledger.");
  } catch {
    return failed("Gagal mencatat pembayaran.");
  }
}

export async function postRefund(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("finance:write");
    const bookingId = String(formData.get("bookingId") ?? "");
    const amount = money(formData.get("amount"));
    const reason = String(formData.get("reason") ?? "").trim();
    if (amount < 1 || !reason) return failed("Nominal dan alasan refund wajib diisi.");
    const refund = await recordRefund({
      bookingId,
      provider: "MANUAL",
      providerRef: `REFUND-${Date.now()}-${randomBytes(3).toString("hex")}`,
      amount,
      reason,
    });
    await writeAudit({ actor: staff, action: "REFUND_RECORDED", entityType: "PAYMENT", entityId: refund.id, after: refund });
    return success("Refund tercatat. Eksekusi transfer tetap dilakukan melalui kanal pembayaran terkait.");
  } catch {
    return failed("Gagal mencatat refund.");
  }
}

export async function createMaintenanceTicket(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("maintenance:write");
    const roomUnitId = String(formData.get("roomUnitId") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    if (!roomUnitId || !title) return failed("Kamar dan judul masalah wajib diisi.");
    const blocksInventory = formData.get("blocksInventory") === "on";
    const room = await prisma.roomUnit.findUnique({ where: { id: roomUnitId } });
    if (!room) return failed("Kamar tidak ditemukan.");
    const ticket = await prisma.$transaction(async (tx) => {
      const saved = await tx.maintenanceTicket.create({
        data: {
          ticketCode: `MNT-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`,
          roomUnitId,
          title,
          description: String(formData.get("description") ?? "").trim() || null,
          priority: String(formData.get("priority") ?? "NORMAL"),
          blocksInventory,
          reportedBy: staff.name,
          assignedTo: String(formData.get("assignedTo") ?? "").trim() || null,
        },
      });
      if (blocksInventory) {
        await tx.roomUnit.update({ where: { id: roomUnitId }, data: { operationalStatus: "OUT_OF_ORDER" } });
      }
      return saved;
    });
    await writeAudit({ actor: staff, action: "MAINTENANCE_CREATED", entityType: "MAINTENANCE_TICKET", entityId: ticket.id, after: ticket });
    return success(`${ticket.ticketCode} dibuat untuk ${room.code}.`);
  } catch {
    return failed("Gagal membuat maintenance ticket.");
  }
}

export async function updateMaintenanceTicket(input: { ticketId: string; status: string }): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("maintenance:write");
    if (!["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(input.status)) return failed("Status maintenance tidak valid.");
    const ticket = await prisma.maintenanceTicket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) return failed("Ticket tidak ditemukan.");
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.maintenanceTicket.update({
        where: { id: ticket.id },
        data: {
          status: input.status,
          resolvedAt: ["RESOLVED", "CLOSED"].includes(input.status) ? new Date() : null,
        },
      });
      if (ticket.blocksInventory && ["RESOLVED", "CLOSED"].includes(input.status)) {
        const otherBlockers = await tx.maintenanceTicket.count({
          where: {
            id: { not: ticket.id },
            roomUnitId: ticket.roomUnitId,
            blocksInventory: true,
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        });
        if (!otherBlockers) {
          await tx.roomUnit.update({ where: { id: ticket.roomUnitId }, data: { operationalStatus: "SELLABLE" } });
        }
      }
      return saved;
    });
    await writeAudit({ actor: staff, action: "MAINTENANCE_STATUS_CHANGED", entityType: "MAINTENANCE_TICKET", entityId: ticket.id, before: ticket, after: updated });
    return success(`${ticket.ticketCode} diperbarui.`);
  } catch {
    return failed("Gagal memperbarui maintenance ticket.");
  }
}

export async function runNightAudit(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("night_audit:run");
    const key = String(formData.get("businessDate") ?? dateKey(new Date()));
    const businessDate = utcBusinessDate(key);
    const start = new Date(businessDate);
    const end = new Date(start.getTime() + 86_400_000);
    const existing = await prisma.businessDay.findUnique({ where: { businessDate }, include: { nightAuditRun: true } });
    if (existing?.nightAuditRun) return failed(`Night audit ${key} sudah pernah dijalankan.`);

    const [arrivalsPending, departuresOpen, openHighMaintenance, occupiedNights, successfulPayments, roomCount] = await Promise.all([
      prisma.booking.count({ where: { checkIn: { gte: propertyDateTime(key, 0), lt: propertyDateTime(key, 23) }, status: "PENDING_PAYMENT" } }),
      prisma.booking.count({ where: { checkOut: { gte: propertyDateTime(key, 0), lt: propertyDateTime(key, 23) }, status: { in: ["CONFIRMED", "CHECKED_IN"] } } }),
      prisma.maintenanceTicket.count({ where: { priority: "HIGH", status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.bookingNight.count({ where: { stayDate: businessDate, booking: { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } } } }),
      prisma.paymentTransaction.aggregate({ where: { status: "SUCCEEDED", occurredAt: { gte: start, lt: end }, type: "PAYMENT" }, _sum: { amount: true } }),
      prisma.roomUnit.count({ where: { operationalStatus: "SELLABLE" } }),
    ]);

    const summary = {
      businessDate: key,
      occupiedNights,
      sellableRooms: roomCount,
      occupancyPercent: roomCount ? Math.round((occupiedNights / roomCount) * 100) : 0,
      paymentRevenue: successfulPayments._sum.amount ?? 0,
      exceptions: { arrivalsPending, departuresOpen, openHighMaintenance },
    };
    const day = await prisma.$transaction(async (tx) => {
      const savedDay = await tx.businessDay.upsert({
        where: { businessDate },
        update: { status: "CLOSED", closedAt: new Date(), closedBy: staff.name, summaryJson: JSON.stringify(summary) },
        create: { businessDate, status: "CLOSED", closedAt: new Date(), closedBy: staff.name, summaryJson: JSON.stringify(summary) },
      });
      await tx.nightAuditRun.create({
        data: {
          businessDayId: savedDay.id,
          status: "COMPLETED",
          runBy: staff.name,
          checklistJson: JSON.stringify({ arrivalsPending, departuresOpen, openHighMaintenance }),
          summaryJson: JSON.stringify(summary),
          completedAt: new Date(),
        },
      });
      await tx.businessDay.upsert({
        where: { businessDate: end },
        update: {},
        create: { businessDate: end, status: "OPEN" },
      });
      return savedDay;
    });
    await writeAudit({ actor: staff, action: "NIGHT_AUDIT_COMPLETED", entityType: "BUSINESS_DAY", entityId: day.id, after: summary });
    return success(`Night audit ${key} selesai; business day berikutnya dibuka.`);
  } catch {
    return failed("Night audit gagal. Periksa log dan data business day.");
  }
}

type NormalizedImport = {
  externalId: string;
  bookingCode: string;
  villaSlug: string;
  roomCode: string | null;
  checkIn: string;
  checkOut: string;
  guestName: string;
  email: string;
  phone: string;
  guests: number;
  totalAmount: number;
  status: string;
  source: string;
  paymentRef: string | null;
};

function normalizeImportRow(row: Record<string, string>, rowNumber: number): { payload: NormalizedImport; errors: string[] } {
  const statusMap: Record<string, string> = {
    new: "PENDING_PAYMENT", pending: "PENDING_PAYMENT", confirmed: "CONFIRMED",
    checked_in: "CHECKED_IN", checked_out: "CHECKED_OUT", cancelled: "CANCELLED",
    canceled: "CANCELLED", no_show: "NO_SHOW", expired: "EXPIRED",
  };
  const rawStatus = (row.status || row.booking_status || "confirmed").toLowerCase().replaceAll(" ", "_");
  const payload: NormalizedImport = {
    externalId: row.qlo_booking_id || row.id_booking || row.external_id || String(rowNumber),
    bookingCode: row.booking_code || row.reference || `QLO-${row.qlo_booking_id || rowNumber}`,
    villaSlug: row.villa_slug || row.room_type_slug || "",
    roomCode: row.room_code || null,
    checkIn: row.check_in || row.checkin_date || "",
    checkOut: row.check_out || row.checkout_date || "",
    guestName: row.guest_name || row.customer_name || "",
    email: row.email || `qlo-${rowNumber}@migration.invalid`,
    phone: row.phone || "MISSING",
    guests: Number(row.guests || row.adults || 1),
    totalAmount: Math.round(Number(row.total_amount || row.total_price || 0)),
    status: statusMap[rawStatus] || rawStatus.toUpperCase(),
    source: row.source || "QLOAPPS_IMPORT",
    paymentRef: row.payment_ref || row.transaction_id || null,
  };
  const errors: string[] = [];
  if (!payload.externalId) errors.push("external id missing");
  if (!payload.villaSlug) errors.push("villa_slug missing");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.checkOut)) errors.push("dates must be YYYY-MM-DD");
  if (payload.checkOut <= payload.checkIn) errors.push("check_out must be after check_in");
  if (!payload.guestName) errors.push("guest_name missing");
  if (!Number.isFinite(payload.guests) || payload.guests < 1) errors.push("guests invalid");
  if (!Number.isFinite(payload.totalAmount) || payload.totalAmount < 0) errors.push("total_amount invalid");
  if (!["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW", "EXPIRED"].includes(payload.status)) errors.push("status unsupported");
  return { payload, errors };
}

export async function stageQloAppsCsv(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("migration:manage");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000) return failed("Pilih CSV QloApps maksimal 5 MB.");
    const rows = csvObjects(await file.text());
    if (!rows.length) return failed("CSV kosong atau tidak memiliki header dan data.");
    const villas = new Set((await prisma.villa.findMany({ select: { slug: true } })).map((villa) => villa.slug));
    const normalized = rows.map((row, index) => normalizeImportRow(row, index + 2));
    for (const item of normalized) if (!villas.has(item.payload.villaSlug)) item.errors.push("villa_slug not found");
    const validRows = normalized.filter((item) => !item.errors.length).length;
    const batch = await prisma.importBatch.create({
      data: {
        fileName: file.name,
        mode: "DRY_RUN",
        status: validRows === normalized.length ? "READY" : "NEEDS_REVIEW",
        totalRows: normalized.length,
        validRows,
        invalidRows: normalized.length - validRows,
        createdBy: staff.name,
        summaryJson: JSON.stringify({ columns: Object.keys(rows[0]), importedAt: new Date().toISOString() }),
        records: {
          create: normalized.map((item, index) => ({
            rowNumber: index + 2,
            externalId: item.payload.externalId,
            status: item.errors.length ? "INVALID" : "VALID",
            payloadJson: JSON.stringify(item.payload),
            errorsJson: item.errors.length ? JSON.stringify(item.errors) : null,
          })),
        },
      },
    });
    await writeAudit({ actor: staff, action: "IMPORT_STAGED", entityType: "IMPORT_BATCH", entityId: batch.id, after: batch });
    return success(`Dry-run selesai: ${validRows} valid, ${normalized.length - validRows} perlu diperbaiki.`);
  } catch {
    return failed("Gagal membaca CSV migrasi.");
  }
}

export async function commitImportBatch(input: { batchId: string }): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("migration:manage");
    const batch = await prisma.importBatch.findUnique({ where: { id: input.batchId }, include: { records: { orderBy: { rowNumber: "asc" } } } });
    if (!batch || batch.status === "COMMITTED") return failed("Batch tidak ditemukan atau sudah committed.");
    if (batch.invalidRows > 0) return failed("Perbaiki seluruh row invalid sebelum commit.");
    let committed = 0;
    let skipped = 0;
    for (const record of batch.records.filter((item) => item.status === "VALID")) {
      const payload = JSON.parse(record.payloadJson) as NormalizedImport;
      const mapped = await prisma.externalIdMapping.findUnique({
        where: { source_entityType_externalId: { source: "QLOAPPS", entityType: "BOOKING", externalId: payload.externalId } },
      });
      if (mapped) {
        skipped += 1;
        await prisma.importRecord.update({ where: { id: record.id }, data: { status: "SKIPPED", localId: mapped.localId } });
        continue;
      }
      const villa = await prisma.villa.findUnique({ where: { slug: payload.villaSlug } });
      if (!villa) continue;
      const checkIn = propertyDateTime(payload.checkIn, 14);
      const checkOut = propertyDateTime(payload.checkOut, 11);
      const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
      const unit = payload.roomCode
        ? await prisma.roomUnit.findFirst({ where: { villaId: villa.id, code: payload.roomCode } })
        : null;
      const duplicateCode = await prisma.booking.findUnique({ where: { bookingCode: payload.bookingCode } });
      const code = duplicateCode ? `QLO-${payload.externalId}-${randomBytes(2).toString("hex").toUpperCase()}` : payload.bookingCode;
      const booking = await prisma.booking.create({
        data: {
          bookingCode: code,
          villaId: villa.id,
          checkIn,
          checkOut,
          guests: Math.min(payload.guests, villa.maxGuests),
          guestName: payload.guestName,
          email: payload.email,
          phone: payload.phone,
          nights,
          totalAmount: payload.totalAmount || nights * villa.pricePerNight,
          status: payload.status,
          source: payload.source,
          paymentProvider: payload.paymentRef ? "QLOAPPS" : null,
          paymentRef: payload.paymentRef,
          internalNotes: `Imported from QloApps id ${payload.externalId}`,
        },
      });
      if (!["CANCELLED", "NO_SHOW", "EXPIRED"].includes(booking.status)) {
        const assigned = await allocateUnitForBooking({
          bookingId: booking.id,
          villaId: villa.id,
          checkIn,
          checkOut,
          preferredUnitId: unit?.id,
        });
        if (!assigned) {
          await prisma.booking.delete({ where: { id: booking.id } });
          await prisma.importRecord.update({ where: { id: record.id }, data: { status: "CONFLICT", errorsJson: JSON.stringify(["no physical room available"]) } });
          continue;
        }
      }
      await ensureFolioForBooking(booking.id);
      await prisma.$transaction([
        prisma.externalIdMapping.create({
          data: {
            source: "QLOAPPS",
            entityType: "BOOKING",
            externalId: payload.externalId,
            localId: booking.id,
            checksum: createHash("sha256").update(record.payloadJson).digest("hex"),
          },
        }),
        prisma.importRecord.update({ where: { id: record.id }, data: { status: "IMPORTED", localId: booking.id } }),
      ]);
      committed += 1;
    }
    const conflictCount = await prisma.importRecord.count({ where: { batchId: batch.id, status: "CONFLICT" } });
    const updated = await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        mode: "COMMIT",
        status: conflictCount ? "COMMITTED_WITH_EXCEPTIONS" : "COMMITTED",
        committedRows: committed,
        committedAt: new Date(),
        summaryJson: JSON.stringify({ committed, skipped, conflicts: conflictCount }),
      },
    });
    await writeAudit({ actor: staff, action: "IMPORT_COMMITTED", entityType: "IMPORT_BATCH", entityId: batch.id, before: batch, after: updated });
    return success(`Commit selesai: ${committed} imported, ${skipped} idempotent skip, ${conflictCount} conflict.`);
  } catch {
    return failed("Commit migrasi gagal; batch tetap dapat diperiksa dan dijalankan ulang.");
  }
}

export async function createStaffUser(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("staff:manage");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "VIEWER") as StaffRole;
    const passwordError = validatePassword(password);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ROLES.includes(role) || passwordError) {
      return failed(passwordError ?? "Nama, email, atau role tidak valid.");
    }
    const created = await prisma.staffUser.create({ data: { email, name, role, passwordHash: hashPassword(password) } });
    await writeAudit({ actor: staff, action: "STAFF_CREATED", entityType: "STAFF_USER", entityId: created.id, after: { email, name, role } });
    return success(`${name} ditambahkan sebagai ${role.replaceAll("_", " ")}.`);
  } catch {
    return failed("Gagal membuat akun; pastikan email belum dipakai.");
  }
}

export async function resetStaffPassword(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("staff:manage");
    const userId = String(formData.get("userId") ?? "");
    const password = String(formData.get("password") ?? "");
    const passwordError = validatePassword(password);
    if (passwordError) return failed(passwordError);
    const user = await prisma.staffUser.update({ where: { id: userId }, data: { passwordHash: hashPassword(password), failedLoginCount: 0, lockedUntil: null } });
    await prisma.staffSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit({ actor: staff, action: "STAFF_PASSWORD_RESET", entityType: "STAFF_USER", entityId: user.id, after: { sessionsRevoked: true } });
    return success(`Password ${user.name} direset; semua sesi lama dicabut.`);
  } catch {
    return failed("Gagal mereset password.");
  }
}

export async function setStaffActive(input: { userId: string; active: boolean }): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("staff:manage");
    if (staff.id === input.userId && !input.active) return failed("Akun yang sedang dipakai tidak dapat dinonaktifkan.");
    const user = await prisma.staffUser.update({ where: { id: input.userId }, data: { active: input.active } });
    if (!input.active) await prisma.staffSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit({ actor: staff, action: input.active ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED", entityType: "STAFF_USER", entityId: user.id });
    return success(`${user.name} ${input.active ? "diaktifkan" : "dinonaktifkan"}.`);
  } catch {
    return failed("Gagal memperbarui status staf.");
  }
}

export async function updateOperationalSetting(formData: FormData): Promise<ControlActionResult> {
  try {
    const staff = await requireStaff("migration:manage");
    const key = String(formData.get("key") ?? "");
    const value = String(formData.get("value") ?? "");
    const allowed: Record<string, string[]> = {
      "migration.mode": ["SHADOW", "VILLAOS_PRIMARY", "QLOAPPS_ROLLBACK"],
      "cutover.pilot_status": ["NOT_STARTED", "PILOT", "READY", "COMPLETED", "ROLLED_BACK"],
    };
    if (!allowed[key]?.includes(value)) return failed("Perubahan mode tidak valid.");
    const before = await prisma.systemSetting.findUnique({ where: { key } });
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value, updatedBy: staff.name },
      create: { key, value, updatedBy: staff.name },
    });
    await writeAudit({ actor: staff, action: "OPERATIONAL_MODE_CHANGED", entityType: "SYSTEM_SETTING", entityId: key, before, after: setting });
    return success(`${key} diubah menjadi ${value}.`);
  } catch {
    return failed("Gagal mengubah mode operasional.");
  }
}

export async function runLocalBackup(): Promise<ControlActionResult> {
  const staff = await requireStaff("backup:run");
  let runId: string | null = null;
  try {
    const run = await prisma.backupRun.create({ data: { status: "RUNNING", createdBy: staff.name } });
    runId = run.id;
    const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
    if (!databaseUrl.startsWith("file:")) return failed("Backup file lokal hanya berlaku untuk profil SQLite.");
    const rawPath = databaseUrl.slice(5);
    const source = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), "prisma", rawPath);
    const backupDir = path.resolve(process.cwd(), "backups");
    await mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const destination = path.join(backupDir, `villaos-${stamp}.db`);
    await copyFile(source, destination);
    const file = await readFile(destination);
    const details = await stat(destination);
    const checksum = createHash("sha256").update(file).digest("hex");
    const completed = await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", location: destination, sizeBytes: details.size, checksum, completedAt: new Date() },
    });
    await writeAudit({ actor: staff, action: "BACKUP_COMPLETED", entityType: "BACKUP_RUN", entityId: completed.id, after: { location: destination, sizeBytes: details.size, checksum } });
    return success(`Backup lokal selesai: ${path.basename(destination)}.`);
  } catch (error) {
    if (runId) {
      await prisma.backupRun.update({ where: { id: runId }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Unknown error", completedAt: new Date() } }).catch(() => undefined);
    }
    return failed("Backup gagal; database sumber tidak diubah.");
  }
}
