import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlanningModule } from './planning/planning.module';
import { IngestModule } from './ingest/ingest.module';
import { FinancialProfileModule } from './financial-profile/financial-profile.module';
import { CashflowModule } from './cashflow/cashflow.module';
import { ProjectionModule } from './projection/projection.module';
import { StrategyReportingModule } from './strategy-reporting/strategy-reporting.module';
import { ReportingModule } from './reporting/reporting.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    PortfolioModule,
    PlanningModule,
    FinancialProfileModule,
    CashflowModule,
    AssetsModule,
    ProjectionModule,
    StrategyReportingModule,
    ReportingModule,
    IngestModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
