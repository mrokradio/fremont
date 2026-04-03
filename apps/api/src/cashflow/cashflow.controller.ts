import {
  Body,
  Controller,
  Get,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CashflowsResponse } from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CashflowService } from './cashflow.service';
import { UpsertCashflowsDto } from './dto/upsert-cashflows.dto';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller('/cashflows')
export class CashflowController {
  constructor(private readonly service: CashflowService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser | undefined): Promise<CashflowsResponse> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.get(user);
  }

  @Put()
  @Roles('ADMIN', 'ANALYST')
  async replace(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpsertCashflowsDto,
  ): Promise<CashflowsResponse> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.replace(user, dto);
  }
}
