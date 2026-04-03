import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpsertAssetDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  category!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsBoolean()
  liquid?: boolean;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
