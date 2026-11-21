import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { APP_NAME, MIN_AGE, type MetaInfo } from '@kodecupid/shared';
import { legalVersionsOf } from '../config/app-config';
import { AppConfigService } from '../config/app-config.module';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness + readiness in one call: the platform health check (Render /
   * Railway / Docker) only reports healthy when the database and PostGIS
   * answer. Returns 503 with the same JSON shape when either is unavailable.
   */
  @Get('health')
  async health(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.check();
    if (report.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }

  @Get('health/db')
  database(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    return this.health(response);
  }

  private async check(): Promise<HealthReport> {
    const base = { uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() };
    try {
      await this.prisma.ping();
    } catch {
      return { status: 'error', database: 'disconnected', postgis: 'unknown', ...base };
    }
    try {
      const version = await this.prisma.postgisVersion();
      return {
        status: version ? 'ok' : 'error',
        database: 'connected',
        postgis: version ? 'enabled' : 'missing',
        ...(version ? { postgisVersion: version } : {}),
        ...base,
      };
    } catch {
      return { status: 'error', database: 'connected', postgis: 'missing', ...base };
    }
  }
}

interface HealthReport {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected';
  postgis: 'enabled' | 'missing' | 'unknown';
  postgisVersion?: string;
  uptime: number;
  timestamp: string;
}

@Controller('meta')
export class MetaController {
  constructor(private readonly config: AppConfigService) {}

  @Get()
  meta(): MetaInfo {
    return {
      appName: APP_NAME,
      environment: this.config.env.NODE_ENV,
      minAge: MIN_AGE,
      debugOtpEnabled: this.config.env.OTP_ALLOW_DEBUG_CODE,
      smsProvider: this.config.env.SMS_PROVIDER,
      legalVersions: legalVersionsOf(this.config.env),
    };
  }
}
