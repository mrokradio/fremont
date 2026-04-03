import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsString, Min, MinLength } from 'class-validator';
import type { JsonRecord } from '@fremont/shared';

export class UpsertPlanningScenarioDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @Type(() => Number)
  @Min(1900)
  startYear!: number;

  @Type(() => Number)
  @Min(1)
  horizonYears!: number;

  @Type(() => Number)
  @IsNumber()
  baseNetWorth!: number;

  @Type(() => Number)
  @IsNumber()
  baseLiquidity!: number;

  @IsObject()
  inputs!: JsonRecord;

  @IsArray()
  events!: JsonRecord[];
}
