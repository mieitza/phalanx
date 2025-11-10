import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDatabase } from './index';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'migration' });

async function runMigrations() {
  try {
    logger.info('Running database migrations...');

    const { db, sqlite } = createDatabase();

    migrate(db, { migrationsFolder: './drizzle' });

    logger.info('Migrations completed successfully');

    sqlite.close();
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  }
}

runMigrations();
