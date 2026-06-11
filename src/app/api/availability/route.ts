import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/availability?villa=<slug>&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 * A villa type is available if active bookings overlapping the range
 * are fewer than its totalUnits.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const slug = searchParams.get("villa");
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");

  if (!slug || !checkIn || !checkOut) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  if (isNaN(inDate.getTime()) || isNaN(outDate.getTime()) || outDate <= inDate) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const villa = await prisma.villa.findUnique({ where: { slug } });
  if (!villa) {
    return NextResponse.json({ error: "Villa not found" }, { status: 404 });
  }

  const overlapping = await prisma.booking.count({
    where: {
      villaId: villa.id,
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      checkIn: { lt: outDate },
      checkOut: { gt: inDate },
    },
  });

  return NextResponse.json({
    available: overlapping < villa.totalUnits,
    pricePerNight: villa.pricePerNight,
  });
}
