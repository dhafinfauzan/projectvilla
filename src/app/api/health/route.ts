import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const mode = await prisma.systemSetting.findUnique({ where: { key: "migration.mode" } });
    return NextResponse.json({ status: "ok", service: "villaos", database: "reachable", mode: mode?.value ?? "UNKNOWN", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", service: "villaos", database: "unreachable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
