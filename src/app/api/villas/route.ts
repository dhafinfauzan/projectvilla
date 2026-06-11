import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const villas = await prisma.villa.findMany({
    orderBy: { pricePerNight: "asc" },
  });
  return NextResponse.json({ villas });
}
