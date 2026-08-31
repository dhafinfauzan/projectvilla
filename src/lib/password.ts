import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  if (password.length < 10) throw new Error("Password must contain at least 10 characters");
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 32 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("hex")}`;
}

export function verifyPassword(candidate: string, encoded: string): boolean {
  try {
    const [algorithm, n, r, p, salt, expectedHex] = encoded.split("$");
    if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
    const expected = Buffer.from(expectedHex, "hex");
    const actual = scryptSync(candidate, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 32 * 1024 * 1024,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return "Password minimal 10 karakter.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password harus mengandung huruf dan angka.";
  }
  return null;
}
