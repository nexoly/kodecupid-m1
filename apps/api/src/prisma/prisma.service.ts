import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../config/app-config.module';
import { PrismaClient } from './generated';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.env.DATABASE_URL }),
      log: config.isDevelopment ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error(
        'Could not connect to PostgreSQL. Check DATABASE_URL and that the database is running.',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Used by GET /health/db. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  /** PostGIS library version, or null when the extension is not installed. */
  async postgisVersion(): Promise<string | null> {
    const rows = await this.$queryRaw<{ version: string | null }[]>`
      SELECT extversion AS version FROM pg_extension WHERE extname = 'postgis'`;
    return rows[0]?.version ?? null;
  }
}
