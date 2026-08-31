import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
if (!databaseUrl.startsWith("file:")) {
  process.stderr.write("Local file backup is only available for a SQLite DATABASE_URL.\n");
  process.exit(1);
}

const rawPath = databaseUrl.slice(5);
const source = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), "prisma", rawPath);
const backupDir = path.resolve(process.cwd(), "backups");
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const destination = path.join(backupDir, `villaos-${stamp}.db`);
const run = await prisma.backupRun.create({ data: { status: "RUNNING", createdBy: "SYSTEM_CLI" } });

try {
  await copyFile(source, destination);
  const file = await readFile(destination);
  const details = await stat(destination);
  const checksum = createHash("sha256").update(file).digest("hex");
  await prisma.backupRun.update({ where: { id: run.id }, data: { status: "COMPLETED", location: destination, sizeBytes: details.size, checksum, completedAt: new Date() } });
  process.stdout.write(`Backup completed: ${destination}\nSHA-256: ${checksum}\n`);
} catch (error) {
  await prisma.backupRun.update({ where: { id: run.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : String(error), completedAt: new Date() } });
  process.stderr.write("Backup failed; the source database was not changed.\n");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
