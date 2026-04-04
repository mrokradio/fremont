import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LiabilitiesController } from './liabilities.controller';
import { LiabilitiesService } from './liabilities.service';

@Module({
  imports: [AuthModule],
  controllers: [LiabilitiesController],
  providers: [LiabilitiesService],
  exports: [LiabilitiesService],
})
export class LiabilitiesModule {}
