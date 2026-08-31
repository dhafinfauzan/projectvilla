import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt}$${hash.toString("hex")}`;
}

const email = "admin@thetaruvillas.local";
const password = `Taru-${randomBytes(12).toString("base64url")}-7`;
const existingOwners = await prisma.staffUser.count({ where: { role: "OWNER", active: true } });

if (existingOwners > 0) {
  process.stdout.write("An active VillaOS owner already exists; bootstrap skipped.\n");
} else {
  await prisma.staffUser.upsert({
    where: { email },
    update: { name: "VillaOS Owner", role: "OWNER", active: true, passwordHash: hashPassword(password) },
    create: { email, name: "VillaOS Owner", role: "OWNER", passwordHash: hashPassword(password) },
  });
  const outputDir = path.resolve(process.cwd(), "outputs");
  const credentialPath = path.join(outputDir, "VillaOS_LOCAL_LOGIN.txt");
  await mkdir(outputDir, { recursive: true });
  await writeFile(credentialPath, [
    "VillaOS local owner login",
    "===========================",
    "",
    `URL: http://localhost:3000/admin`,
    `Email: ${email}`,
    `Temporary password: ${password}`,
    "",
    "Keep this file private. After signing in, create named staff accounts in",
    "Control Center > Team and store long-term credentials in a password manager.",
    "",
  ].join("\n"), { mode: 0o600 });
  await chmod(credentialPath, 0o600);
  process.stdout.write(`Local owner created. Credentials saved to ${credentialPath}\n`);
}

await prisma.$disconnect();
