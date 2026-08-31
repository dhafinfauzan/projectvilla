"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  authenticateStaff,
  clearAdminSession,
  requireStaff,
} from "@/lib/admin-auth";
import { writeAudit } from "@/lib/audit";
import { ensureFolioForBooking, recordPayment } from "@/lib/finance";
import { allocateUnitForBooking, releaseBookingInventory } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { getRateQuote } from "@/lib/rates";

export type AdminActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function loginAdmin(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await authenticateStaff(email, password);
  if (!result.ok) redirect(`/admin?error=${result.reason === "LOCKED" ? "locked" : "invalid-credentials"}`);
  await writeAudit({ actor: result.user, action: "SESSION_LOGIN", entityType: "STAFF_USER", entityId: result.user.id });
  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  const staff = await requireStaff();
  await writeAudit({ actor: staff, action: "SESSION_LOGOUT", entityType: "STAFF_USER", entityId: staff.id });
  await clearAdminSession();
  redirect("/admin");
}

const RESERVATION_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["CHECKED_OUT"],
};

export async function updateBookingStatus(input: {
  bookingId: string;
  nextStatus: string;
}): Promise<AdminActionResult> {
  try {
    const staff = await requireStaff("reservation:write");
    const booking = await prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { assignedUnit: true },
    });
    if (!booking) return { ok: false, message: "Reservasi tidak ditemukan." };
    if (!RESERVATION_TRANSITIONS[booking.status]?.includes(input.nextStatus)) {
      return { ok: false, message: `Transisi ${booking.status} → ${input.nextStatus} tidak diizinkan.` };
    }
    if (input.nextStatus === "CHECKED_IN" && !booking.assignedUnitId) {
      return { ok: false, message: "Pilih unit kamar sebelum check-in." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: input.nextStatus },
      });

      if (input.nextStatus === "CHECKED_OUT" && booking.assignedUnitId) {
        await tx.roomUnit.update({
          where: { id: booking.assignedUnitId },
          data: { housekeepingStatus: "DIRTY" },
        });
        await tx.housekeepingTask.create({
          data: {
            roomUnitId: booking.assignedUnitId,
            businessDate: new Date(),
            taskType: "TURNOVER",
            status: "OPEN",
            priority: "HIGH",
            note: `Auto-created after checkout ${booking.bookingCode}.`,
          },
        });
      }
    });

    if (["CANCELLED", "EXPIRED", "NO_SHOW"].includes(input.nextStatus)) {
      await releaseBookingInventory(booking.id);
    }
    if (input.nextStatus === "CONFIRMED" && booking.status === "PENDING_PAYMENT") {
      await recordPayment({
        bookingId: booking.id,
        provider: "MANUAL",
        providerRef: `MANUAL-${booking.bookingCode}-${Date.now()}`,
        amount: booking.totalAmount,
        method: "FRONT_DESK",
      });
    } else if (["CHECKED_IN", "CHECKED_OUT"].includes(input.nextStatus)) {
      await ensureFolioForBooking(booking.id);
    }

    await writeAudit({
      actor: staff,
      action: "BOOKING_STATUS_CHANGED",
      entityType: "BOOKING",
      entityId: booking.id,
      before: { status: booking.status },
      after: { status: input.nextStatus },
    });

    revalidatePath("/admin");
    return { ok: true, message: `Status ${booking.bookingCode} diperbarui.` };
  } catch {
    return { ok: false, message: "Aksi ditolak. Muat ulang lalu coba lagi." };
  }
}

export async function assignRoom(input: {
  bookingId: string;
  roomUnitId: string;
}): Promise<AdminActionResult> {
  try {
    const staff = await requireStaff("reservation:write");
    const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } });
    const unit = await prisma.roomUnit.findUnique({ where: { id: input.roomUnitId } });
    if (!booking || !unit || unit.villaId !== booking.villaId) {
      return { ok: false, message: "Unit tidak cocok dengan tipe villa reservasi." };
    }
    if (unit.operationalStatus !== "SELLABLE") {
      return { ok: false, message: "Unit sedang tidak dapat dijual." };
    }

    const assigned = await allocateUnitForBooking({
      bookingId: booking.id,
      villaId: booking.villaId,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      preferredUnitId: unit.id,
    });
    if (!assigned) return { ok: false, message: "Unit bentrok dengan reservasi lain." };
    await writeAudit({
      actor: staff,
      action: "ROOM_ASSIGNED",
      entityType: "BOOKING",
      entityId: booking.id,
      before: { assignedUnitId: booking.assignedUnitId },
      after: { assignedUnitId: unit.id, unitCode: unit.code },
    });
    revalidatePath("/admin");
    return { ok: true, message: `${unit.code} berhasil ditugaskan.` };
  } catch {
    return { ok: false, message: "Gagal menugaskan unit kamar." };
  }
}

export async function updateHousekeepingTask(input: {
  taskId: string;
  nextStatus: "IN_PROGRESS" | "DONE" | "INSPECTED";
}): Promise<AdminActionResult> {
  try {
    const staff = await requireStaff("housekeeping:write");
    const task = await prisma.housekeepingTask.findUnique({ where: { id: input.taskId } });
    if (!task) return { ok: false, message: "Tugas housekeeping tidak ditemukan." };
    const roomStatus = {
      IN_PROGRESS: "CLEANING",
      DONE: "CLEAN",
      INSPECTED: "INSPECTED",
    }[input.nextStatus];

    await prisma.$transaction([
      prisma.housekeepingTask.update({
        where: { id: task.id },
        data: { status: input.nextStatus },
      }),
      prisma.roomUnit.update({
        where: { id: task.roomUnitId },
        data: { housekeepingStatus: roomStatus },
      }),
    ]);
    await writeAudit({
      actor: staff,
      action: "HOUSEKEEPING_STATUS_CHANGED",
      entityType: "HOUSEKEEPING_TASK",
      entityId: task.id,
      before: { status: task.status },
      after: { status: input.nextStatus, roomStatus },
    });
    revalidatePath("/admin");
    return { ok: true, message: "Status housekeeping diperbarui." };
  } catch {
    return { ok: false, message: "Gagal memperbarui housekeeping." };
  }
}

function bookingCode(): string {
  return `TARU-${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;
}

export async function createWalkInBooking(input: {
  guestName: string;
  email: string;
  phone: string;
  villaId: string;
  roomUnitId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  notes?: string;
}): Promise<AdminActionResult> {
  try {
    const staff = await requireStaff("reservation:write");
    const checkIn = new Date(`${input.checkIn}T14:00:00`);
    const checkOut = new Date(`${input.checkOut}T11:00:00`);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
    if (!input.guestName.trim() || !input.phone.trim() || nights < 1) {
      return { ok: false, message: "Nama, telepon, dan rentang tanggal wajib valid." };
    }

    const villa = await prisma.villa.findUnique({ where: { id: input.villaId } });
    const unit = await prisma.roomUnit.findUnique({ where: { id: input.roomUnitId } });
    if (!villa || !unit || unit.villaId !== villa.id || unit.operationalStatus !== "SELLABLE") {
      return { ok: false, message: "Villa atau unit kamar tidak tersedia." };
    }
    if (input.guests < 1 || input.guests > villa.maxGuests) {
      return { ok: false, message: `Kapasitas maksimal ${villa.maxGuests} tamu.` };
    }

    const quote = await getRateQuote(villa, checkIn, checkOut);
    if (!quote.sellable) return { ok: false, message: "Tanggal memiliki pembatasan rate atau stop-sell." };
    const created = await prisma.booking.create({
      data: {
        bookingCode: bookingCode(),
        villaId: villa.id,
        checkIn,
        checkOut,
        guests: input.guests,
        guestName: input.guestName.trim(),
        email: input.email.trim() || `walkin-${Date.now()}@local.invalid`,
        phone: input.phone.trim(),
        internalNotes: input.notes?.trim() || null,
        nights,
        totalAmount: quote.total,
        status: "CONFIRMED",
        source: "WALK_IN",
        paymentProvider: "MANUAL",
        paymentRef: "PAY_AT_PROPERTY",
      },
    });

    const assigned = await allocateUnitForBooking({
      bookingId: created.id,
      villaId: villa.id,
      checkIn,
      checkOut,
      preferredUnitId: unit.id,
    });
    if (!assigned) {
      await prisma.booking.delete({ where: { id: created.id } });
      return { ok: false, message: "Unit baru saja terisi pada tanggal tersebut." };
    }
    await ensureFolioForBooking(created.id);
    await writeAudit({ actor: staff, action: "BOOKING_CREATED", entityType: "BOOKING", entityId: created.id, after: created });
    revalidatePath("/admin");
    return { ok: true, message: `Walk-in ${created.bookingCode} berhasil dibuat.` };
  } catch {
    return { ok: false, message: "Walk-in gagal dibuat. Periksa data dan coba lagi." };
  }
}

export async function modifyBooking(input: {
  bookingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  phone: string;
  internalNotes?: string;
}): Promise<AdminActionResult> {
  try {
    const staff = await requireStaff("reservation:write");
    const booking = await prisma.booking.findUnique({ where: { id: input.bookingId }, include: { villa: true } });
    if (!booking) return { ok: false, message: "Reservasi tidak ditemukan." };
    if (!["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status)) {
      return { ok: false, message: "Hanya reservasi pending atau confirmed yang dapat diubah." };
    }
    const checkIn = new Date(`${input.checkIn}T14:00:00`);
    const checkOut = new Date(`${input.checkOut}T11:00:00`);
    const quote = await getRateQuote(booking.villa, checkIn, checkOut);
    if (!quote.sellable || input.guests < 1 || input.guests > booking.villa.maxGuests) {
      return { ok: false, message: "Tanggal, rate, atau jumlah tamu tidak valid." };
    }
    const before = booking;
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        checkIn,
        checkOut,
        nights: quote.nights,
        totalAmount: quote.total,
        guests: input.guests,
        guestName: input.guestName.trim(),
        phone: input.phone.trim(),
        internalNotes: input.internalNotes?.trim() || null,
      },
    });
    const assigned = await allocateUnitForBooking({
      bookingId: booking.id,
      villaId: booking.villaId,
      checkIn,
      checkOut,
      preferredUnitId: booking.assignedUnitId,
    });
    if (!assigned) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          checkIn: before.checkIn,
          checkOut: before.checkOut,
          nights: before.nights,
          totalAmount: before.totalAmount,
          guests: before.guests,
          guestName: before.guestName,
          phone: before.phone,
          internalNotes: before.internalNotes,
        },
      });
      return { ok: false, message: "Unit tidak tersedia untuk tanggal baru." };
    }
    await ensureFolioForBooking(booking.id);
    await writeAudit({ actor: staff, action: "BOOKING_MODIFIED", entityType: "BOOKING", entityId: booking.id, before, after: updated });
    revalidatePath("/admin");
    return { ok: true, message: `${booking.bookingCode} berhasil diperbarui.` };
  } catch {
    return { ok: false, message: "Gagal mengubah reservasi." };
  }
}
