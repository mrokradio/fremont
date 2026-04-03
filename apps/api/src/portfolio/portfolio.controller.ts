import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import type {
  DashboardResponse,
  PortfolioSnapshot,
  Position,
  PositionWriteInput,
  Transaction,
  TransactionWriteInput,
} from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpsertPositionDto } from './dto/upsert-position.dto';
import { UpsertTransactionDto } from './dto/upsert-transaction.dto';
import { PortfolioService } from './portfolio.service';

@UseGuards(AuthGuard)
@Controller('/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('/snapshot')
  async snapshot(): Promise<PortfolioSnapshot> {
    return this.portfolioService.snapshot();
  }

  @Get('/positions')
  async positions(): Promise<Position[]> {
    return this.portfolioService.positions();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'ANALYST')
  @Post('/positions')
  async createPosition(@Body() dto: UpsertPositionDto): Promise<Position> {
    return this.portfolioService.createPosition(dto as PositionWriteInput);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'ANALYST')
  @Put('/positions/:id')
  async updatePosition(@Param('id') id: string, @Body() dto: UpsertPositionDto): Promise<Position> {
    return this.portfolioService.updatePosition(id, dto as PositionWriteInput);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'ANALYST')
  @Delete('/positions/:id')
  async deletePosition(@Param('id') id: string): Promise<{ status: 'ok' }> {
    await this.portfolioService.deletePosition(id);
    return { status: 'ok' };
  }

  @Get('/transactions')
  async transactions(): Promise<Transaction[]> {
    return this.portfolioService.transactions();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'ANALYST')
  @Post('/transactions')
  async createTransaction(@Body() dto: UpsertTransactionDto): Promise<Transaction> {
    return this.portfolioService.createTransaction(dto as TransactionWriteInput);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'ANALYST')
  @Put('/transactions/:id')
  async updateTransaction(@Param('id') id: string, @Body() dto: UpsertTransactionDto): Promise<Transaction> {
    return this.portfolioService.updateTransaction(id, dto as TransactionWriteInput);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'ANALYST')
  @Delete('/transactions/:id')
  async deleteTransaction(@Param('id') id: string): Promise<{ status: 'ok' }> {
    await this.portfolioService.deleteTransaction(id);
    return { status: 'ok' };
  }

  @Get('/dashboard')
  async dashboard(): Promise<DashboardResponse> {
    return this.portfolioService.dashboard();
  }
}
