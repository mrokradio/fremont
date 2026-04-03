import { Type } from 'class-transformer';
import { IsNumber, IsObject } from 'class-validator';
import type { JsonRecord } from '@fremont/shared';

export class UpsertFinancialProfileDto {
  @Type(() => Number)
  @IsNumber()
  baseNetWorth!: number;

  @Type(() => Number)
  @IsNumber()
  baseLiquidity!: number;

  @IsObject()
  assumptions!: JsonRecord;
}
