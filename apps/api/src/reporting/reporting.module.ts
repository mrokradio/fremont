import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectionModule } from '../projection/projection.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [AuthModule, ProjectionModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
