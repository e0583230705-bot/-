import "server-only";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/**
 * בפיתוח מקומי משתמשים ב־PGlite — Postgres אמיתי שרץ בתוך התהליך, בלי שרת.
 * בייצור נחליף ל־Postgres מנוהל (למשל Supabase/Neon) בלי לשנות את הסכמה.
 */
export type Db = PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { dbPromise?: Promise<Db> };

async function init(): Promise<Db> {
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (!dataDir.includes("://")) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export function getDb(): Promise<Db> {
  globalForDb.dbPromise ??= init();
  return globalForDb.dbPromise;
}

export { schema };
