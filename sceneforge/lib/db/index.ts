import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';
import { paths } from '../config';

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const g = globalThis as unknown as { __sfDb?: { path: string; db: DB } };

export function migrationsFolder() {
  return path.join(process.cwd(), 'lib', 'db', 'migrations');
}

/** Single shared connection per process. WAL + busy timeout allow the web app and worker to share the file. */
export function getDb(): DB {
  const file = paths.db();
  if (g.__sfDb && g.__sfDb.path === file) return g.__sfDb.db;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 10000');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema }) as DB;
  migrate(db, { migrationsFolder: migrationsFolder() });
  g.__sfDb = { path: file, db };
  return db;
}

export function closeDb() {
  if (g.__sfDb) {
    g.__sfDb.db.$client.close();
    g.__sfDb = undefined;
  }
}

export { schema };
