import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { AssetRecord } from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpsertAssetDto } from './dto/upsert-asset.dto';
import { AssetsService } from './assets.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller('/assets')
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser | undefined): Promise<AssetRecord[]> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.list(user);
  }

  @Post()
  @Roles('ADMIN', 'ANALYST')
  async create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpsertAssetDto,
  ): Promise<AssetRecord> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.create(user, dto);
  }

  @Put('/:id')
  @Roles('ADMIN', 'ANALYST')
  async update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
    @Body() dto: UpsertAssetDto,
  ): Promise<AssetRecord> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.service.update(user, id, dto);
  }

  @Delete('/:id')
  @Roles('ADMIN', 'ANALYST')
  async remove(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
  ): Promise<{ status: 'ok' }> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    await this.service.remove(user, id);
    return { status: 'ok' };
  }
}
