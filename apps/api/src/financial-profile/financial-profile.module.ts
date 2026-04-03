import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinancialProfileController } from './financial-profile.controller';
import { FinancialProfileService } from './financial-profile.service';

@Module({
  imports: [AuthModule],
  controllers: [FinancialProfileController],
  providers: [FinancialProfileService],
  exports: [FinancialProfileService],
})
export class FinancialProfileModule {}
