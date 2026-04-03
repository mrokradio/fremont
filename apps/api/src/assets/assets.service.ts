import { Injectable, NotFoundException } from '@nestjs/common';
import type { AssetRecord, AssetWriteInput } from '@fremont/shared';
import type { Asset as PrismaAsset } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapAsset(row: PrismaAsset): AssetRecord {
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      category: row.category,
      value: row.value,
      liquid: row.liquid,
      owner: row.owner ?? undefined,
      note: row.note ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private normalizeInput(input: AssetWriteInput): AssetWriteInput {
    return {
      name: input.name.trim() || 'Untitled',
      category: input.category.trim() || 'Uncategorized',
      value: Number(input.value) || 0,
      liquid: !!input.liquid,
      owner: input.owner?.trim() || undefined,
      note: input.note?.trim() || undefined,
    };
  }

  async list(user: AuthenticatedUser): Promise<AssetRecord[]> {
    const rows = await this.prisma.asset.findMany({
      where: { ownerId: user.id },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.mapAsset(row));
  }

  async create(user: AuthenticatedUser, input: AssetWriteInput): Promise<AssetRecord> {
    const normalized = this.normalizeInput(input);
    const row = await this.prisma.asset.create({
      data: {
        ownerId: user.id,
        name: normalized.name,
        category: normalized.category,
        value: normalized.value,
        liquid: !!normalized.liquid,
        owner: normalized.owner,
        note: normalized.note,
      },
    });
    return this.mapAsset(row);
  }

  async update(user: AuthenticatedUser, id: string, input: AssetWriteInput): Promise<AssetRecord> {
    const existing = await this.prisma.asset.findFirst({
      where: { id, ownerId: user.id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Asset not found');
    }

    const normalized = this.normalizeInput(input);
    const row = await this.prisma.asset.update({
      where: { id },
      data: {
        name: normalized.name,
        category: normalized.category,
        value: normalized.value,
        liquid: !!normalized.liquid,
        owner: normalized.owner,
        note: normalized.note,
      },
    });
    return this.mapAsset(row);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const result = await this.prisma.asset.deleteMany({
      where: { id, ownerId: user.id },
    });
    if (result.count === 0) {
      throw new NotFoundException('Asset not found');
    }
  }
}
