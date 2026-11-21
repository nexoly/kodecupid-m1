import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * Neon (and most managed Postgres providers) require the *direct* connection for
 * migrations and seeding: DDL and advisory locks are unreliable through a
 * transaction-mode pooler. The running API therefore uses the pooled URL while
 * the CLI uses DATABASE_URL_UNPOOLED, falling back to DATABASE_URL for local
 * Postgres where only one URL exists.
 *
 * Swapping to AWS RDS later only changes these two environment variables.
 */
const configuredUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

// `prisma generate` only reads the schema and never connects, so it must work
// without a database (CI build job, fresh checkouts). Every command that talks
// to the database still fails fast with a clear message.
const isGenerateOnly = process.argv.includes('generate');

if (!configuredUrl && !isGenerateOnly) {
  throw new Error('Set DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL for Prisma CLI commands.');
}

const migrationUrl =
  configuredUrl ?? 'postgresql://unused:unused@localhost:5432/unused?schema=public';

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
  },
  datasource: {
    url: migrationUrl,
  },
});
