import { Injectable, NotFoundException } from '@nestjs/common';
import type { Liability, LiabilityWriteInput } from '@fremont/shared';
import type { Liability as PrismaLiability } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class LiabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapLiability(row: PrismaLiability): Liability {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      balance: row.balance,
      rate: row.rate ?? undefined,
      maturityDate: row.maturityDate ? row.maturityDate.toISOString().slice(0, 10) : undefined,
      owner: row.owner ?? undefined,
      note: row.note ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private normalizeInput(input: LiabilityWriteInput): LiabilityWriteInput {
    return {
      name: input.name.trim() || 'Untitled',
      category: input.category.trim() || 'Other',
      balance: Number(input.balance) || 0,
      rate: input.rate != null ? Number(input.rate) : undefined,
      maturityDate: input.maturityDate?.trim() || undefined,
      owner: input.owner?.trim() || undefined,
      note: input.note?.trim() || undefined,
    };
  }

  async list(): Promise<Liability[]> {
    const rows = await this.prisma.liability.findMany({
      orderBy: [{ balance: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.mapLiability(row));
  }

  async create(input: LiabilityWriteInput): Promise<Liability> {
    const normalized = this.normalizeInput(input);
    const row = await this.prisma.liability.create({
      data: {
        name: normalized.name,
        category: normalized.category,
        balance: normalized.balance,
        rate: normalized.rate ?? null,
        maturityDate: normalized.maturityDate ? new Date(normalized.maturityDate) : null,
        owner: normalized.owner ?? null,
        note: normalized.note ?? null,
      },
    });
    return this.mapLiability(row);
  }

  async update(id: string, input: LiabilityWriteInput): Promise<Liability> {
    const existing = await this.prisma.liability.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Liability not found');
    }

    const normalized = this.normalizeInput(input);
    const row = await this.prisma.liability.update({
      where: { id },
      data: {
        name: normalized.name,
        category: normalized.category,
        balance: normalized.balance,
        rate: normalized.rate ?? null,
        maturityDate: normalized.maturityDate ? new Date(normalized.maturityDate) : null,
        owner: normalized.owner ?? null,
        note: normalized.note ?? null,
      },
    });
    return this.mapLiability(row);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.liability.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Liability not found');
    }
    await this.prisma.liability.delete({ where: { id } });
  }
}
