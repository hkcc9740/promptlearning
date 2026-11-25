// Runs database migrations before `next build` when a database is configured
// (e.g. on Vercel, where the Neon integration provides DATABASE_URL).
// Locally without DATABASE_URL this is a no-op — PGlite migrates itself.
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  console.log("[migrate] No DATABASE_URL — skipping migrations.");
  process.exit(0);
}

console.log("[migrate] Applying database migrations…");
const r = spawnSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
