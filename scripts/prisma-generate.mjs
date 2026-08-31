import { spawnSync } from "node:child_process";
import path from "node:path";

const isPostgres = /^(postgres|postgresql):\/\//.test(process.env.DATABASE_URL ?? "");
if (isPostgres) {
  const prepared = spawnSync(process.execPath, [path.resolve("scripts/prepare-postgres-schema.mjs")], { stdio: "inherit" });
  if (prepared.status !== 0) process.exit(prepared.status ?? 1);
}
const schema = isPostgres ? "prisma/postgresql/schema.prisma" : "prisma/schema.prisma";
const prismaCli = path.resolve("node_modules/prisma/build/index.js");
const generated = spawnSync(process.execPath, [prismaCli, "generate", "--schema", schema], { stdio: "inherit" });
process.exit(generated.status ?? 1);
