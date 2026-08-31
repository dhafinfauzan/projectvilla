import { Prisma } from "@prisma/client";
import { stayDates } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function allocateUnitForBooking(input: {
  bookingId: string;
  villaId: string;
  checkIn: Date;
  checkOut: Date;
  preferredUnitId?: string | null;
}): Promise<string | null> {
  const dates = stayDates(input.checkIn, input.checkOut);
  if (!dates.length) return null;

  const units = await prisma.roomUnit.findMany({
    where: {
      villaId: input.villaId,
      operationalStatus: "SELLABLE",
      ...(input.preferredUnitId ? { id: input.preferredUnitId } : {}),
    },
    orderBy: { code: "asc" },
  });

  for (const unit of units) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.bookingNight.deleteMany({ where: { bookingId: input.bookingId } });
        await tx.bookingNight.createMany({
          data: dates.map((stayDate) => ({
            bookingId: input.bookingId,
            roomUnitId: unit.id,
            stayDate,
          })),
        });
        await tx.booking.update({
          where: { id: input.bookingId },
          data: { assignedUnitId: unit.id },
        });
      });
      return unit.id;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }
  return null;
}

export async function releaseBookingInventory(bookingId: string): Promise<void> {
  await prisma.bookingNight.deleteMany({ where: { bookingId } });
}

export async function availableUnitCount(villaId: string, checkIn: Date, checkOut: Date): Promise<number> {
  const dates = stayDates(checkIn, checkOut);
  if (!dates.length) return 0;
  const units = await prisma.roomUnit.findMany({
    where: { villaId, operationalStatus: "SELLABLE" },
    select: { id: true },
  });
  if (!units.length) return 0;
  const occupied = await prisma.bookingNight.groupBy({
    by: ["roomUnitId"],
    where: {
      roomUnitId: { in: units.map((unit) => unit.id) },
      stayDate: { in: dates },
      booking: { status: { in: ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"] } },
    },
  });
  return Math.max(0, units.length - occupied.length);
}
