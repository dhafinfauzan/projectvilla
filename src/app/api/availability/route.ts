import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireStaleBookings } from "@/lib/bookings";
import { availableUnitCount } from "@/lib/inventory";
import { getRateQuote } from "@/lib/rates";

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

  // Release date holds from unpaid bookings before counting.
  await expireStaleBookings();

  const [availableUnits, quote] = await Promise.all([
    availableUnitCount(villa.id, inDate, outDate),
    getRateQuote(villa, inDate, outDate),
  ]);

  return NextResponse.json({
    available: availableUnits > 0 && quote.sellable,
    availableUnits,
    pricePerNight: quote.averagePerNight,
    totalPrice: quote.total,
    restrictions: quote.restrictions,
  });
}
