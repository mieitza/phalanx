import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { createLogger } from '@phalanx/shared';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

const logger = createLogger({ name: 'database' });

export interface DatabaseConfig {
  url?: string;
  readonly?: boolean;
  verbose?: boolean;
}

export function createDatabase(config: DatabaseConfig = {}) {
  const url = config.url || process.env.DATABASE_URL || './data/phalanx.db';

  logger.info({ url, readonly: config.readonly }, 'Initializing database connection');

  // Ensure data directory exists
  const dbDir = dirname(url);
  mkdir(dbDir, { recursive: true }).catch((err) => {
    logger.error({ err, dir: dbDir }, 'Failed to create database directory');
  });

  // Create SQLite connection
  const sqlite = new Database(url, {
    readonly: config.readonly,
    fileMustExist: false,
    verbose: config.verbose ? (msg: string) => logger.debug(msg) : undefined,
  });

  // Enable WAL mode for better concurrency
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');

  // Create Drizzle instance
  const db = drizzle(sqlite, { schema, logger: config.verbose });

  logger.info('Database connection established');

  return { db, sqlite };
}

export { schema };
export * from './repositories';
