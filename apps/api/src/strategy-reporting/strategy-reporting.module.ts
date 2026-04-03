import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StrategyReportingController } from './strategy-reporting.controller';
import { StrategyReportingService } from './strategy-reporting.service';

@Module({
  imports: [AuthModule],
  controllers: [StrategyReportingController],
  providers: [StrategyReportingService],
})
export class StrategyReportingModule {}
