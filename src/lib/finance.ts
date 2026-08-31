import { prisma } from "@/lib/prisma";

export async function ensureFolioForBooking(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const folio = await prisma.folio.upsert({
    where: { bookingId },
    update: {},
    create: { bookingId, currency: booking.currency },
  });
  await prisma.folioEntry.upsert({
    where: { externalRef: `ROOM:${bookingId}` },
    update: {
      debit: booking.totalAmount,
      description: `Accommodation · ${booking.nights} night${booking.nights === 1 ? "" : "s"}`,
    },
    create: {
      folioId: folio.id,
      entryType: "ROOM_CHARGE",
      description: `Accommodation · ${booking.nights} night${booking.nights === 1 ? "" : "s"}`,
      debit: booking.totalAmount,
      externalRef: `ROOM:${bookingId}`,
      serviceDate: booking.checkIn,
    },
  });
  return folio;
}

export async function folioBalance(folioId: string): Promise<number> {
  const totals = await prisma.folioEntry.aggregate({
    where: { folioId, voidedAt: null },
    _sum: { debit: true, credit: true },
  });
  return (totals._sum.debit ?? 0) - (totals._sum.credit ?? 0);
}

export async function recordPayment(input: {
  bookingId: string;
  provider: string;
  providerRef: string;
  amount: number;
  method?: string | null;
  metadata?: unknown;
}) {
  const folio = await ensureFolioForBooking(input.bookingId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.paymentTransaction.findUnique({
      where: { providerRef: input.providerRef },
    });
    if (existing) return { payment: existing, duplicate: true };
    const payment = await tx.paymentTransaction.create({
      data: {
        bookingId: input.bookingId,
        folioId: folio.id,
        provider: input.provider,
        providerRef: input.providerRef,
        amount: input.amount,
        method: input.method ?? null,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
    await tx.folioEntry.create({
      data: {
        folioId: folio.id,
        entryType: "PAYMENT",
        description: `${input.provider} payment${input.method ? ` · ${input.method}` : ""}`,
        credit: input.amount,
        externalRef: `PAYMENT:${input.providerRef}`,
      },
    });
    return { payment, duplicate: false };
  });
}

export async function recordRefund(input: {
  bookingId: string;
  provider: string;
  providerRef: string;
  amount: number;
  reason: string;
}) {
  const folio = await ensureFolioForBooking(input.bookingId);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.paymentTransaction.create({
      data: {
        bookingId: input.bookingId,
        folioId: folio.id,
        provider: input.provider,
        providerRef: input.providerRef,
        type: "REFUND",
        amount: input.amount,
        method: input.reason,
      },
    });
    await tx.folioEntry.create({
      data: {
        folioId: folio.id,
        entryType: "REFUND",
        description: `Refund · ${input.reason}`,
        debit: input.amount,
        externalRef: `REFUND:${input.providerRef}`,
      },
    });
    return payment;
  });
}
