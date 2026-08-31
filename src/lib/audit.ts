import type { CurrentStaff } from "@/lib/admin-auth";
import { getRequestContext } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

function safeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item instanceof Date) return item.toISOString();
    return item;
  });
}

export async function writeAudit(input: {
  actor?: CurrentStaff | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const context = await getRequestContext();
  await prisma.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: safeJson(input.before),
      afterJson: safeJson(input.after),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });
}
