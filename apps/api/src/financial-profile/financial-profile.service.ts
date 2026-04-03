import { Injectable } from '@nestjs/common';
import type { FinancialProfile, PlanningScenarioInputs, TaxBasis } from '@fremont/shared';
import { Prisma, type FinancialProfile as FinancialProfileRow } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma.service';
import { UpsertFinancialProfileDto } from './dto/upsert-financial-profile.dto';

@Injectable()
export class FinancialProfileService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAssumptions(input: Record<string, unknown> | undefined): PlanningScenarioInputs {
    const taxRateRaw = Number(input?.taxRate ?? 0);
    const taxRate = Number.isFinite(taxRateRaw) ? Math.max(0, Math.min(1, taxRateRaw)) : 0;
    const taxBasisRaw = input?.taxBasis;
    const taxBasis: TaxBasis = taxBasisRaw === 'net_income' ? 'net_income' : 'gross_income';
    const inflationRateRaw = Number(input?.inflationRate);
    const returnRateRaw = Number(input?.returnRate);

    return {
      taxRate,
      taxBasis,
      inflationRate: Number.isFinite(inflationRateRaw) ? inflationRateRaw : undefined,
      returnRate: Number.isFinite(returnRateRaw) ? returnRateRaw : undefined,
    };
  }

  private toFinancialProfile(row: FinancialProfileRow, userId: string): FinancialProfile {
    return {
      userId,
      baseNetWorth: row.baseNetWorth,
      baseLiquidity: row.baseLiquidity,
      assumptions: this.normalizeAssumptions((row.assumptions as Record<string, unknown>) ?? {}),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async get(user: AuthenticatedUser): Promise<FinancialProfile> {
    const existing = await this.prisma.financialProfile.findUnique({
      where: { ownerId: user.id },
    });

    if (!existing) {
      return {
        userId: user.id,
        baseNetWorth: 0,
        baseLiquidity: 0,
        assumptions: {
          taxRate: 0,
          taxBasis: 'gross_income',
        },
        updatedAt: new Date().toISOString(),
      };
    }

    return this.toFinancialProfile(existing, user.id);
  }

  async upsert(user: AuthenticatedUser, dto: UpsertFinancialProfileDto): Promise<FinancialProfile> {
    const assumptions = this.normalizeAssumptions((dto.assumptions as Record<string, unknown>) ?? {});

    const row = await this.prisma.financialProfile.upsert({
      where: { ownerId: user.id },
      create: {
        ownerId: user.id,
        baseNetWorth: dto.baseNetWorth,
        baseLiquidity: dto.baseLiquidity,
        assumptions: assumptions as Prisma.InputJsonValue,
      },
      update: {
        baseNetWorth: dto.baseNetWorth,
        baseLiquidity: dto.baseLiquidity,
        assumptions: assumptions as Prisma.InputJsonValue,
      },
    });

    return this.toFinancialProfile(row, user.id);
  }
}
