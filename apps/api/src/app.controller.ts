import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@fremont/shared';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/health')
  health(): HealthResponse {
    return this.appService.health();
  }
}
