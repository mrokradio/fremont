import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  Prisma,
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
import { STRATEGY_KINDS } from '@fremont/shared';
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

const fallbackSnapshot: PortfolioSnapshot = {
  asOf: new Date().toISOString().slice(0, 10),
  netWorth: 0,
  liquidity: 0,
  allocation: [],
  upcomingCashflows: [],
};

const STRATEGY_ASSET_CLASS = 'Fremont Strategy';
const STRATEGY_TAG = 'fremont-strategy';
const STRATEGIES: StrategyKind[] = [...STRATEGY_KINDS];

const DEMO_POSITION_SIGNATURES: Array<{
  name: string;
  assetClass: string;
  value: number;
  costBasis?: number;
  irr?: number;
}> = [
  { name: 'S&P 500 ETF', assetClass: 'Public Equity', value: 18_400_000, costBasis: 12_300_000, irr: 0.11 },
  { name: 'PE Fund VI LP', assetClass: 'Private Equity', value: 9_800_000, costBasis: 8_500_000, irr: 0.18 },
  { name: 'RE Fund II', assetClass: 'Real Assets', value: 6_200_000, costBasis: 5_100_000, irr: 0.09 },
  { name: 'Treasury Bills', assetClass: 'Fixed Income', value: 3_750_000, costBasis: 3_750_000, irr: 0.05 },
  { name: 'Cash - Operating', assetClass: 'Cash', value: 2_500_000 },
  { name: 'Venture Fund III', assetClass: 'Private Equity', value: 4_300_000, costBasis: 3_600_000, irr: 0.22 },
];

@Injectable()
export class PortfolioService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}
  private demoRowsPruned = false;

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultStrategyRows();
  }

  private async pruneDemoSeedRows(): Promise<void> {
    if (this.demoRowsPruned) return;
    this.demoRowsPruned = true;

    const names = DEMO_POSITION_SIGNATURES.map((item) => item.name);
    const candidates = await this.prisma.position.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true, assetClass: true, value: true, costBasis: true, irr: true },
    });

    if (candidates.length !== DEMO_POSITION_SIGNATURES.length) return;

    const allMatch = DEMO_POSITION_SIGNATURES.every((expected) =>
      candidates.some(
        (row) =>
          row.name === expected.name &&
          row.assetClass === expected.assetClass &&
          row.value === expected.value &&
          (row.costBasis ?? undefined) === expected.costBasis &&
          (row.irr ?? undefined) === expected.irr,
      ),
    );
    if (!allMatch) return;

    await this.prisma.position.deleteMany({
      where: { id: { in: candidates.map((row) => row.id) } },
    });
  }

  private async ensureDefaultStrategyRows(): Promise<void> {
    const existing = await this.prisma.position.findMany({
      where: {
        assetClass: STRATEGY_ASSET_CLASS,
        name: { in: STRATEGIES },
      },
      select: { name: true },
    });

    const existingNames = new Set(existing.map((row) => row.name));
    const missing = STRATEGIES.filter((strategy) => !existingNames.has(strategy));
    if (missing.length === 0) return;

    await this.prisma.position.createMany({
      data: missing.map((strategy) => ({
        name: strategy,
        assetClass: STRATEGY_ASSET_CLASS,
        value: 0,
        tags: [STRATEGY_TAG],
        liquid: false,
        year: null,
        costBasis: null,
        irr: null,
      })),
    });
  }

  private mapPosition(row: PrismaPosition): Position {
    return {
      id: row.id,
      name: row.name,
      assetClass: row.assetClass,
      year: row.year ?? undefined,
      value: row.value,
      costBasis: row.costBasis ?? undefined,
      irr: row.irr ?? undefined,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
      liquid: row.liquid,
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
      await this.pruneDemoSeedRows();
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
        year: input.year,
        value: input.value,
        costBasis: input.costBasis,
        irr: input.irr,
        tags: input.tags ?? [],
        liquid: input.liquid ?? false,
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
          year: input.year,
          value: input.value,
          costBasis: input.costBasis,
          irr: input.irr,
          tags: input.tags ?? [],
          liquid: input.liquid ?? false,
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
