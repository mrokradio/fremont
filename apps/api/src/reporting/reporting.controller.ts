import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type {
  FinancialWorkspaceResponse,
  ReportingYearFacts,
  ScenarioCompareDetailResponse,
} from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ReportingService } from './reporting.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller()
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get('/reporting/facts')
  async getFacts(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('year') year?: string,
  ): Promise<ReportingYearFacts> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.getYearFacts(user, year);
  }

  @Get('/reporting/scenarios/compare')
  async compareScenarios(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('baselineId') baselineId?: string,
    @Query('comparisonId') comparisonId?: string,
  ): Promise<ScenarioCompareDetailResponse> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    if (!baselineId || !comparisonId) {
      throw new BadRequestException('baselineId and comparisonId are required');
    }
    return this.service.compareScenarios(user, baselineId, comparisonId);
  }

  @Get('/financial/workspace')
  async getWorkspace(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('year') year?: string,
  ): Promise<FinancialWorkspaceResponse> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.getWorkspace(user, year);
  }
}
