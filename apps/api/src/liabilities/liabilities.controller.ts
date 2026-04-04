import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { Liability } from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpsertLiabilityDto } from './dto/upsert-liability.dto';
import { LiabilitiesService } from './liabilities.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller('/liabilities')
export class LiabilitiesController {
  constructor(private readonly service: LiabilitiesService) {}

  @Get()
  async list(): Promise<Liability[]> {
    return this.service.list();
  }

  @Post()
  @Roles('ADMIN', 'ANALYST')
  async create(@Body() dto: UpsertLiabilityDto): Promise<Liability> {
    return this.service.create(dto);
  }

  @Put('/:id')
  @Roles('ADMIN', 'ANALYST')
  async update(@Param('id') id: string, @Body() dto: UpsertLiabilityDto): Promise<Liability> {
    return this.service.update(id, dto);
  }

  @Delete('/:id')
  @Roles('ADMIN', 'ANALYST')
  async remove(@Param('id') id: string): Promise<{ status: 'ok' }> {
    await this.service.remove(id);
    return { status: 'ok' };
  }
}
