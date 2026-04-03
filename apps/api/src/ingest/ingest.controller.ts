import { Body, Controller, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { CsvIngestResult, PositionWriteInput, TransactionWriteInput } from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CsvIngestDto } from './dto/csv-ingest.dto';
import { IngestService } from './ingest.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST')
@Controller('/ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('/positions')
  async ingestPositions(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CsvIngestDto,
  ): Promise<CsvIngestResult<PositionWriteInput>> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.ingestService.ingestPositions(user, dto);
  }

  @Post('/transactions')
  async ingestTransactions(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CsvIngestDto,
  ): Promise<CsvIngestResult<TransactionWriteInput>> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.ingestService.ingestTransactions(user, dto);
  }
}
