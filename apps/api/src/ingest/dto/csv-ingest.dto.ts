import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { IngestionMode } from '@fremont/shared';

const INGEST_MODES: IngestionMode[] = ['append', 'replace'];

export class CsvIngestDto {
  @IsString()
  @MinLength(1)
  csv!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsIn(INGEST_MODES)
  mode?: IngestionMode;
}
