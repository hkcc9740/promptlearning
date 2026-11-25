// Server-only. Two backends, same schema:
//   • DATABASE_URL set  → Neon serverless Postgres (production / shared dev).
//   • DATABASE_URL unset → embedded PGlite in ./.data/pglite (zero-setup local dev),
//     migrated automatically — including new migrations while the dev server runs.
// Neon is migrated explicitly with `npm run db:migrate`.
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Cache = { db?: Promise<Db>; migratedCount?: number; migrating?: Promise<void> };
const globalCache = globalThis as unknown as { __promptAcademyDb?: Cache };
const cache: Cache = (globalCache.__promptAcademyDb ??= {});

const MIGRATIONS = path.join(process.cwd(), "drizzle");

function migrationCount(): number {
  try {
    const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, "meta", "_journal.json"), "utf8"));
    return Array.isArray(journal.entries) ? journal.entries.length : 0;
  } catch {
    return 0;
  }
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema }) as unknown as Db;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production.");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(path.dirname(dataDir), { recursive: true }); // PGlite won't create parents
  return drizzle(new PGlite(dataDir), { schema }) as unknown as Db;
}

/** Local PGlite only: apply any migrations added since this process last checked. */
async function migrateLocal(db: Db): Promise<void> {
  if (process.env.DATABASE_URL) return;
  const count = migrationCount();
  if (cache.migratedCount === count) return;
  cache.migrating ??= (async () => {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: MIGRATIONS });
    cache.migratedCount = count;
  })().finally(() => {
    cache.migrating = undefined;
  });
  await cache.migrating;
}

/** Lazily-connected singleton (survives dev hot reloads). */
export async function getDb(): Promise<Db> {
  cache.db ??= connect().catch((e) => {
    cache.db = undefined; // allow retry after a failed connect
    throw e;
  });
  const db = await cache.db;
  await migrateLocal(db);
  return db;
}

export { schema };
