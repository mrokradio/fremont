import {
  Body,
  Controller,
  Get,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FinancialProfile } from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpsertFinancialProfileDto } from './dto/upsert-financial-profile.dto';
import { FinancialProfileService } from './financial-profile.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller('/financial/profile')
export class FinancialProfileController {
  constructor(private readonly service: FinancialProfileService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser | undefined): Promise<FinancialProfile> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.get(user);
  }

  @Put()
  @Roles('ADMIN', 'ANALYST')
  async upsert(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpsertFinancialProfileDto,
  ): Promise<FinancialProfile> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.upsert(user, dto);
  }
}
