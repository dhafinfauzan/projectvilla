import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function registerWebhook(provider: string, eventId: string, payload: unknown): Promise<{ id: string; duplicate: boolean }> {
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider, eventId } },
  });
  if (existing) {
    if (existing.payloadHash !== payloadHash) throw new Error("Webhook event id reused with a different payload");
    await prisma.webhookEvent.update({ where: { id: existing.id }, data: { attempts: { increment: 1 } } });
    return { id: existing.id, duplicate: existing.status === "PROCESSED" || existing.status === "IGNORED" };
  }
  const created = await prisma.webhookEvent.create({ data: { provider, eventId, payloadHash } });
  return { id: created.id, duplicate: false };
}

export async function completeWebhook(id: string, status: "PROCESSED" | "IGNORED" | "FAILED", error?: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id },
    data: { status, lastError: error ?? null, processedAt: status === "FAILED" ? null : new Date() },
  });
}
