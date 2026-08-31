import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";
import { escapeCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireStaff("reports:read"); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const payments = await prisma.paymentTransaction.findMany({ include: { booking: true }, orderBy: { occurredAt: "asc" } });
  const headers = ["occurred_at", "booking_code", "provider", "provider_ref", "type", "status", "method", "amount", "currency"];
  const rows = payments.map((payment) => [payment.occurredAt.toISOString(), payment.booking.bookingCode, payment.provider, payment.providerRef, payment.type, payment.status, payment.method ?? "", payment.amount, payment.currency]);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="villaos-revenue-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
