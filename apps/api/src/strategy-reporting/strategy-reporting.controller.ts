import {
  Body,
  Controller,
  Get,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { StrategyBenchmark, StrategyReportingBundle } from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  UpsertStrategyBenchmarksDto,
  UpsertStrategyExposuresDto,
} from './dto/upsert-strategy-reporting.dto';
import { StrategyReportingService } from './strategy-reporting.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller('/reporting/strategies')
export class StrategyReportingController {
  constructor(private readonly service: StrategyReportingService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser | undefined): Promise<StrategyReportingBundle> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.get(user);
  }

  @Put()
  @Roles('ADMIN', 'ANALYST')
  async replace(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpsertStrategyExposuresDto,
  ): Promise<StrategyReportingBundle> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.replaceExposures(user, dto);
  }

  @Get('/benchmarks')
  async getBenchmarks(): Promise<StrategyBenchmark[]> {
    return this.service.getBenchmarks();
  }

  @Put('/benchmarks')
  @Roles('ADMIN')
  async replaceBenchmarks(@Body() dto: UpsertStrategyBenchmarksDto): Promise<StrategyBenchmark[]> {
    return this.service.replaceBenchmarks(dto);
  }
}
