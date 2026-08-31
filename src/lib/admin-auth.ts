import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

const STAFF_COOKIE = "villaos_staff_session";
const SESSION_HOURS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export const ROLES = [
  "OWNER",
  "MANAGER",
  "FRONT_DESK",
  "HOUSEKEEPING",
  "FINANCE",
  "VIEWER",
] as const;

export type StaffRole = (typeof ROLES)[number];
export type Permission =
  | "dashboard:read"
  | "reservation:write"
  | "housekeeping:write"
  | "rates:write"
  | "finance:write"
  | "maintenance:write"
  | "night_audit:run"
  | "reports:read"
  | "migration:manage"
  | "staff:manage"
  | "audit:read"
  | "backup:run";

const ROLE_PERMISSIONS: Record<StaffRole, Set<Permission>> = {
  OWNER: new Set([
    "dashboard:read", "reservation:write", "housekeeping:write", "rates:write",
    "finance:write", "maintenance:write", "night_audit:run", "reports:read",
    "migration:manage", "staff:manage", "audit:read", "backup:run",
  ]),
  MANAGER: new Set([
    "dashboard:read", "reservation:write", "housekeeping:write", "rates:write",
    "finance:write", "maintenance:write", "night_audit:run", "reports:read",
    "migration:manage", "audit:read", "backup:run",
  ]),
  FRONT_DESK: new Set([
    "dashboard:read", "reservation:write", "housekeeping:write",
    "maintenance:write", "reports:read",
  ]),
  HOUSEKEEPING: new Set(["dashboard:read", "housekeeping:write", "maintenance:write"]),
  FINANCE: new Set(["dashboard:read", "finance:write", "night_audit:run", "reports:read", "audit:read"]),
  VIEWER: new Set(["dashboard:read", "reports:read"]),
};

export type CurrentStaff = {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  sessionId: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role as StaffRole]?.has(permission) ?? false;
}

export async function adminIsConfigured(): Promise<boolean> {
  return (await prisma.staffUser.count({ where: { active: true } })) > 0;
}

export async function getRequestContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded ?? requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
  };
}

export async function authenticateStaff(email: string, password: string): Promise<
  | { ok: true; user: CurrentStaff }
  | { ok: false; reason: "INVALID" | "LOCKED" }
> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.staffUser.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.active) return { ok: false, reason: "INVALID" };

  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: "LOCKED" };
  if (!verifyPassword(password, user.passwordHash)) {
    const failures = user.failedLoginCount + 1;
    await prisma.staffUser.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failures >= MAX_FAILED_LOGINS ? 0 : failures,
        lockedUntil: failures >= MAX_FAILED_LOGINS
          ? new Date(Date.now() + LOCK_MINUTES * 60_000)
          : null,
      },
    });
    return { ok: false, reason: "INVALID" };
  }

  const rawToken = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60_000);
  const context = await getRequestContext();
  const session = await prisma.$transaction(async (tx) => {
    await tx.staffUser.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return tx.staffSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  });

  (await cookies()).set(STAFF_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as StaffRole,
      sessionId: session.id,
    },
  };
}

export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const rawToken = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!rawToken) return null;
  const session = await prisma.staffSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) {
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as StaffRole,
    sessionId: session.id,
  };
}

export async function isAdminAuthenticated(): Promise<boolean> {
  return Boolean(await getCurrentStaff());
}

export async function requireStaff(permission: Permission = "dashboard:read"): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff || !hasPermission(staff.role, permission)) throw new Error("Unauthorized");
  return staff;
}

export async function clearAdminSession(): Promise<void> {
  const rawToken = (await cookies()).get(STAFF_COOKIE)?.value;
  if (rawToken) {
    await prisma.staffSession.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  (await cookies()).delete(STAFF_COOKIE);
}
