import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { StrategyKind } from '@fremont/shared';
import { STRATEGY_KINDS } from '../strategy.constants';

class StrategyExposureDto {
  @IsIn(STRATEGY_KINDS)
  strategy!: StrategyKind;

  @Type(() => Number)
  @IsNumber()
  capital!: number;
}

class StrategyBenchmarkDto {
  @IsIn(STRATEGY_KINDS)
  strategy!: StrategyKind;

  @Type(() => Number)
  @IsNumber()
  @Min(1900)
  @Max(2300)
  year!: number;

  @Type(() => Number)
  @IsNumber()
  targetReturnRate!: number;

  @Type(() => Number)
  @IsNumber()
  actualReturnRate!: number;

  @Type(() => Number)
  @IsNumber()
  plannedLiquidityRate!: number;

  @Type(() => Number)
  @IsNumber()
  actualLiquidityRate!: number;
}

export class UpsertStrategyExposuresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StrategyExposureDto)
  exposures!: StrategyExposureDto[];
}

export class UpsertStrategyBenchmarksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StrategyBenchmarkDto)
  benchmarks!: StrategyBenchmarkDto[];
}
