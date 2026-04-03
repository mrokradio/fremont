import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@fremont/shared';

@Injectable()
export class AppService {
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'fremont-api',
      timestamp: new Date().toISOString(),
    };
  }
}
