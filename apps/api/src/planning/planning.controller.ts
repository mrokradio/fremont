import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
  Body,
} from '@nestjs/common';
import type { PlanningScenario } from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpsertPlanningScenarioDto } from './dto/upsert-planning-scenario.dto';
import { PlanningService } from './planning.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller('/planning/scenarios')
export class PlanningController {
  constructor(private readonly planningService: PlanningService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser | undefined): Promise<PlanningScenario[]> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.planningService.list(user);
  }

  @Post()
  @Roles('ADMIN', 'ANALYST')
  async create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpsertPlanningScenarioDto,
  ): Promise<PlanningScenario> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.planningService.create(user, dto);
  }

  @Put('/:id')
  @Roles('ADMIN', 'ANALYST')
  async update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
    @Body() dto: UpsertPlanningScenarioDto,
  ): Promise<PlanningScenario> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.planningService.update(user, id, dto);
  }

  @Delete('/:id')
  @Roles('ADMIN', 'ANALYST')
  async remove(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
  ): Promise<{ status: 'ok' }> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    await this.planningService.remove(user, id);
    return { status: 'ok' };
  }
}
