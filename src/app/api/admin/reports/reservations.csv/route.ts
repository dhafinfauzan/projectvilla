import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";
import { escapeCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireStaff("reports:read"); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const bookings = await prisma.booking.findMany({ include: { villa: true, assignedUnit: true }, orderBy: { checkIn: "asc" } });
  const headers = ["booking_code", "guest_name", "email", "phone", "villa", "room", "check_in", "check_out", "nights", "guests", "status", "source", "total_amount", "currency"];
  const rows = bookings.map((booking) => [booking.bookingCode, booking.guestName, booking.email, booking.phone, booking.villa.name, booking.assignedUnit?.code ?? "", booking.checkIn.toISOString(), booking.checkOut.toISOString(), booking.nights, booking.guests, booking.status, booking.source, booking.totalAmount, booking.currency]);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="villaos-reservations-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
