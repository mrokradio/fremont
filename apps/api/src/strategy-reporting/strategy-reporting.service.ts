import { Injectable } from '@nestjs/common';
import { Prisma, StrategyKind as PrismaStrategyKind } from '@prisma/client';
import {
  type StrategyBenchmark,
  type StrategyExposure,
  type StrategyKind,
  type StrategyReportingBundle,
} from '@fremont/shared';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma.service';
import {
  UpsertStrategyBenchmarksDto,
  UpsertStrategyExposuresDto,
} from './dto/upsert-strategy-reporting.dto';
import { STRATEGY_KINDS } from './strategy.constants';

const STRATEGY_TO_DB: Record<StrategyKind, PrismaStrategyKind> = {
  'Liquidity Program': PrismaStrategyKind.Liquidity_Program,
  OpCos: PrismaStrategyKind.OpCos,
  'BF Global': PrismaStrategyKind.BF_Global,
  'Opportunities Fund': PrismaStrategyKind.Opportunities_Fund,
};

const STRATEGY_FROM_DB: Record<PrismaStrategyKind, StrategyKind> = {
  [PrismaStrategyKind.Liquidity_Program]: 'Liquidity Program',
  [PrismaStrategyKind.OpCos]: 'OpCos',
  [PrismaStrategyKind.BF_Global]: 'BF Global',
  [PrismaStrategyKind.Opportunities_Fund]: 'Opportunities Fund',
};

const isStrategyKind = (value: string): value is StrategyKind =>
  (STRATEGY_KINDS as readonly string[]).includes(value);

const toDbStrategy = (value: string): PrismaStrategyKind | null =>
  isStrategyKind(value) ? STRATEGY_TO_DB[value] : null;

const STRATEGY_ASSET_CLASS = 'Fremont Strategy';
const STRATEGY_TAG = 'fremont-strategy';

@Injectable()
export class StrategyReportingService {
  constructor(private readonly prisma: PrismaService) {}

  private mapExposure(item: { id: string; strategy: StrategyKind; capital: number }): StrategyExposure {
    return {
      id: item.id,
      strategy: item.strategy,
      capital: item.capital,
    };
  }

  private mapBenchmark(item: {
    id: string;
    strategy: PrismaStrategyKind;
    year: number;
    targetReturnRate: number;
    actualReturnRate: number;
    plannedLiquidityRate: number;
    actualLiquidityRate: number;
  }): StrategyBenchmark {
    return {
      id: item.id,
      strategy: STRATEGY_FROM_DB[item.strategy],
      year: item.year,
      targetReturnRate: item.targetReturnRate,
      actualReturnRate: item.actualReturnRate,
      plannedLiquidityRate: item.plannedLiquidityRate,
      actualLiquidityRate: item.actualLiquidityRate,
    };
  }

  private async loadExposuresFromPositions(user: AuthenticatedUser): Promise<StrategyExposure[]> {
    const [strategyRows, legacyRows] = await Promise.all([
      this.prisma.position.findMany({
        where: {
          assetClass: STRATEGY_ASSET_CLASS,
          name: { in: [...STRATEGY_KINDS] },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.strategyExposure.findMany({
        where: { ownerId: user.id },
        orderBy: { strategy: 'asc' },
      }),
    ]);

    const fromPositions = new Map<StrategyKind, { id: string; capital: number }>();
    strategyRows.forEach((row) => {
      if (!isStrategyKind(row.name)) return;
      if (fromPositions.has(row.name)) return;
      fromPositions.set(row.name, { id: row.id, capital: row.value });
    });

    const fromLegacy = new Map<StrategyKind, { id: string; capital: number }>();
    legacyRows.forEach((row) => {
      const strategy = STRATEGY_FROM_DB[row.strategy];
      if (fromLegacy.has(strategy)) return;
      fromLegacy.set(strategy, { id: row.id, capital: row.capital });
    });

    return STRATEGY_KINDS.map((strategy) => {
      const existing = fromPositions.get(strategy) ?? fromLegacy.get(strategy);
      return this.mapExposure({
        id: existing?.id ?? `exp-${strategy.replace(/\s+/g, '-').toLowerCase()}`,
        strategy,
        capital: existing?.capital ?? 0,
      });
    });
  }

  async get(user: AuthenticatedUser): Promise<StrategyReportingBundle> {
    const [exposures, benchmarks] = await Promise.all([
      this.loadExposuresFromPositions(user),
      this.prisma.strategyBenchmark.findMany({
        orderBy: [{ year: 'asc' }, { strategy: 'asc' }],
      }),
    ]);

    return {
      exposures,
      benchmarks: benchmarks.map((item) => this.mapBenchmark(item)),
    };
  }

  async getBenchmarks(): Promise<StrategyBenchmark[]> {
    const rows = await this.prisma.strategyBenchmark.findMany({
      orderBy: [{ year: 'asc' }, { strategy: 'asc' }],
    });
    return rows.map((item) => this.mapBenchmark(item));
  }

  async replaceExposures(
    user: AuthenticatedUser,
    dto: UpsertStrategyExposuresDto,
  ): Promise<StrategyReportingBundle> {
    const exposureByStrategy = new Map<StrategyKind, number>();
    (dto.exposures || []).forEach((row) => {
      if (!isStrategyKind(row.strategy)) return;
      exposureByStrategy.set(row.strategy, Number(row.capital) || 0);
    });

    await this.prisma.$transaction(async (tx) => {
      for (const strategy of STRATEGY_KINDS) {
        const capital = exposureByStrategy.get(strategy) ?? 0;
        const existing = await tx.position.findFirst({
          where: {
            assetClass: STRATEGY_ASSET_CLASS,
            name: strategy,
          },
          select: { id: true },
        });

        if (existing) {
          await tx.position.update({
            where: { id: existing.id },
            data: {
              value: capital,
              liquid: false,
              tags: [STRATEGY_TAG],
              costBasis: null,
              irr: null,
            },
          });
          continue;
        }

        await tx.position.create({
          data: {
            name: strategy,
            assetClass: STRATEGY_ASSET_CLASS,
            value: capital,
            tags: [STRATEGY_TAG],
            liquid: false,
          },
        });
      }

      const legacyRows = STRATEGY_KINDS.map((strategy) => {
        const dbStrategy = toDbStrategy(strategy);
        if (!dbStrategy) return null;
        return {
          ownerId: user.id,
          strategy: dbStrategy,
          capital: exposureByStrategy.get(strategy) ?? 0,
        };
      }).filter((row): row is Prisma.StrategyExposureCreateManyInput => row !== null);

      await tx.strategyExposure.deleteMany({ where: { ownerId: user.id } });
      if (legacyRows.length > 0) {
        await tx.strategyExposure.createMany({ data: legacyRows });
      }
    });

    return this.get(user);
  }

  async replaceBenchmarks(dto: UpsertStrategyBenchmarksDto): Promise<StrategyBenchmark[]> {
    const benchmarkByKey = new Map<string, Prisma.StrategyBenchmarkCreateManyInput>();
    (dto.benchmarks || []).forEach((row) => {
      const strategy = toDbStrategy(row.strategy);
      if (!strategy) return;
      const normalizedYear = Math.round(Number(row.year) || new Date().getFullYear());
      benchmarkByKey.set(`${strategy}-${normalizedYear}`, {
        strategy,
        year: normalizedYear,
        targetReturnRate: Number(row.targetReturnRate) || 0,
        actualReturnRate: Number(row.actualReturnRate) || 0,
        plannedLiquidityRate: Number(row.plannedLiquidityRate) || 0,
        actualLiquidityRate: Number(row.actualLiquidityRate) || 0,
      });
    });

    const benchmarks = Array.from(benchmarkByKey.values());

    await this.prisma.$transaction(async (tx) => {
      await tx.strategyBenchmark.deleteMany({});
      if (benchmarks.length > 0) {
        await tx.strategyBenchmark.createMany({ data: benchmarks });
      }
    });

    return this.getBenchmarks();
  }
}
