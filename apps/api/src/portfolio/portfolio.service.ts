import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  StrategyKind as PrismaStrategyKind,
  TransactionCategory as PrismaTransactionCategory,
  type Position as PrismaPosition,
  type Transaction as PrismaTransaction,
} from '@prisma/client';
import type {
  DashboardResponse,
  PortfolioSnapshot,
  Position,
  PositionWriteInput,
  StrategyKind,
  Transaction,
  TransactionCategory,
  TransactionWriteInput,
} from '@fremont/shared';
import { PrismaService } from '../common/prisma.service';

const CATEGORY_TO_DB: Record<TransactionCategory, PrismaTransactionCategory> = {
  'Capital Call': 'Capital_Call',
  Distribution: 'Distribution',
  Fee: 'Fee',
  Interest: 'Interest',
  Dividend: 'Dividend',
  Transfer: 'Transfer',
  Expense: 'Expense',
  Other: 'Other',
};

const CATEGORY_FROM_DB: Record<PrismaTransactionCategory, TransactionCategory> = {
  Capital_Call: 'Capital Call',
  Distribution: 'Distribution',
  Fee: 'Fee',
  Interest: 'Interest',
  Dividend: 'Dividend',
  Transfer: 'Transfer',
  Expense: 'Expense',
  Other: 'Other',
};

const STRATEGY_TO_DB: Record<StrategyKind, PrismaStrategyKind> = {
  'Liquidity Program': 'Liquidity_Program',
  OpCos: 'OpCos',
  'BF Global': 'BF_Global',
  'Opportunities Fund': 'Opportunities_Fund',
};

const STRATEGY_FROM_DB: Record<PrismaStrategyKind, StrategyKind> = {
  Liquidity_Program: 'Liquidity Program',
  OpCos: 'OpCos',
  BF_Global: 'BF Global',
  Opportunities_Fund: 'Opportunities Fund',
};

const fallbackSnapshot: PortfolioSnapshot = {
  asOf: new Date().toISOString().slice(0, 10),
  netWorth: 0,
  liquidity: 0,
  allocation: [],
  upcomingCashflows: [],
};

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  private mapPosition(row: PrismaPosition): Position {
    return {
      id: row.id,
      name: row.name,
      assetClass: row.assetClass,
      strategy: row.strategy ? STRATEGY_FROM_DB[row.strategy] : undefined,
      year: row.year ?? undefined,
      value: row.value,
      costBasis: row.costBasis ?? undefined,
      irr: row.irr ?? undefined,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
      liquid: row.liquid,
      owner: row.owner ?? undefined,
    };
  }

  private mapTransaction(row: PrismaTransaction): Transaction {
    return {
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      description: row.description,
      amount: row.amount,
      category: CATEGORY_FROM_DB[row.category],
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    };
  }

  async snapshot(): Promise<PortfolioSnapshot> {
    try {
      const latest = await this.prisma.portfolioSnapshot.findFirst({
        orderBy: { asOf: 'desc' },
        include: { allocation: true, upcomingCashflows: true },
      });

      if (!latest) return fallbackSnapshot;

      return {
        asOf: latest.asOf.toISOString().slice(0, 10),
        netWorth: latest.netWorth,
        liquidity: latest.liquidity,
        allocation: latest.allocation.map((slice) => ({
          assetClass: slice.assetClass,
          percent: slice.percent,
        })),
        upcomingCashflows: latest.upcomingCashflows
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((flow) => ({
            date: flow.date.toISOString().slice(0, 10),
            amount: flow.amount,
            description: flow.description,
          })),
      };
    } catch {
      return fallbackSnapshot;
    }
  }

  async positions(): Promise<Position[]> {
    try {
      const rows = await this.prisma.position.findMany({ orderBy: { value: 'desc' } });
      if (rows.length === 0) return [];
      return rows.map((row) => this.mapPosition(row));
    } catch {
      return [];
    }
  }

  async createPosition(input: PositionWriteInput): Promise<Position> {
    const created = await this.prisma.position.create({
      data: {
        name: input.name,
        assetClass: input.assetClass,
        strategy: input.strategy ? STRATEGY_TO_DB[input.strategy] : null,
        year: input.year,
        value: input.value,
        costBasis: input.costBasis,
        irr: input.irr,
        tags: input.tags ?? [],
        liquid: input.liquid ?? false,
        owner: input.owner?.trim() || null,
      },
    });

    return this.mapPosition(created);
  }

  async updatePosition(id: string, input: PositionWriteInput): Promise<Position> {
    try {
      const updated = await this.prisma.position.update({
        where: { id },
        data: {
          name: input.name,
          assetClass: input.assetClass,
          strategy: input.strategy ? STRATEGY_TO_DB[input.strategy] : null,
          year: input.year,
          value: input.value,
          costBasis: input.costBasis,
          irr: input.irr,
          tags: input.tags ?? [],
          liquid: input.liquid ?? false,
          owner: input.owner?.trim() || null,
        },
      });
      return this.mapPosition(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Position not found');
      }
      throw error;
    }
  }

  async deletePosition(id: string): Promise<void> {
    try {
      await this.prisma.position.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Position not found');
      }
      throw error;
    }
  }

  async transactions(): Promise<Transaction[]> {
    try {
      const rows = await this.prisma.transaction.findMany({ orderBy: { date: 'desc' } });
      if (rows.length === 0) return [];
      return rows.map((row) => this.mapTransaction(row));
    } catch {
      return [];
    }
  }

  async createTransaction(input: TransactionWriteInput): Promise<Transaction> {
    const created = await this.prisma.transaction.create({
      data: {
        date: new Date(input.date),
        description: input.description,
        amount: input.amount,
        category: CATEGORY_TO_DB[input.category],
        tags: input.tags ?? [],
      },
    });

    return this.mapTransaction(created);
  }

  async updateTransaction(id: string, input: TransactionWriteInput): Promise<Transaction> {
    try {
      const updated = await this.prisma.transaction.update({
        where: { id },
        data: {
          date: new Date(input.date),
          description: input.description,
          amount: input.amount,
          category: CATEGORY_TO_DB[input.category],
          tags: input.tags ?? [],
        },
      });
      return this.mapTransaction(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Transaction not found');
      }
      throw error;
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    try {
      await this.prisma.transaction.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Transaction not found');
      }
      throw error;
    }
  }

  async dashboard(): Promise<DashboardResponse> {
    const [snapshot, positions, transactions] = await Promise.all([
      this.snapshot(),
      this.positions(),
      this.transactions(),
    ]);

    return {
      snapshot,
      positions,
      transactions,
    };
  }
}
