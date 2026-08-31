import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const source = path.resolve(process.cwd(), "prisma/schema.prisma");
const targetDir = path.resolve(process.cwd(), "prisma/postgresql");
const target = path.join(targetDir, "schema.prisma");
const schema = await readFile(source, "utf8");
const postgres = schema
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace("// The local release intentionally uses SQLite. A production PostgreSQL\n  // schema and rollout guide live in prisma/postgresql and docs/.", "// Generated production profile. Do not edit directly; run npm run db:postgres:prepare.");
await mkdir(targetDir, { recursive: true });
await writeFile(target, postgres);
process.stdout.write(`PostgreSQL Prisma profile generated at ${target}\n`);
