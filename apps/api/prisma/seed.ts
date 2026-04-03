import { randomBytes, pbkdf2Sync } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  await prisma.allocationSlice.deleteMany();
  await prisma.cashflow.deleteMany();
  await prisma.portfolioSnapshot.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.position.deleteMany();
  await prisma.ingestionJob.deleteMany();
  await prisma.strategyBenchmark.deleteMany();
  await prisma.strategyExposure.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.planningCashflowItem.deleteMany();
  await prisma.financialProfile.deleteMany();
  await prisma.planningScenario.deleteMany();
  await prisma.user.deleteMany();

  await prisma.position.createMany({
    data: [
      { name: 'Liquidity Program', assetClass: 'Fremont Strategy', value: 0, tags: ['fremont-strategy'], liquid: false },
      { name: 'OpCos', assetClass: 'Fremont Strategy', value: 0, tags: ['fremont-strategy'], liquid: false },
      { name: 'BF Global', assetClass: 'Fremont Strategy', value: 0, tags: ['fremont-strategy'], liquid: false },
      { name: 'Opportunities Fund', assetClass: 'Fremont Strategy', value: 0, tags: ['fremont-strategy'], liquid: false },
    ],
  });

  const snapshot = await prisma.portfolioSnapshot.create({
    data: {
      asOf: new Date(),
      netWorth: 0,
      liquidity: 0,
    },
    include: { allocation: true, upcomingCashflows: true },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@fremont.local',
      name: process.env.SEED_ADMIN_NAME ?? 'Fremont Admin',
      passwordHash: hashPassword(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'),
      role: 'ADMIN',
    },
  });

  await prisma.user.createMany({
    data: [
      {
        email: process.env.SEED_ANALYST_EMAIL ?? 'analyst@fremont.local',
        name: process.env.SEED_ANALYST_NAME ?? 'Fremont Analyst',
        passwordHash: hashPassword(process.env.SEED_ANALYST_PASSWORD ?? 'ChangeMe123!'),
        role: 'ANALYST',
      },
      {
        email: process.env.SEED_VIEWER_EMAIL ?? 'viewer@fremont.local',
        name: process.env.SEED_VIEWER_NAME ?? 'Fremont Viewer',
        passwordHash: hashPassword(process.env.SEED_VIEWER_PASSWORD ?? 'ChangeMe123!'),
        role: 'VIEWER',
      },
    ],
  });

  const seededUsers = await prisma.user.findMany({
    select: { id: true, email: true },
  });
  await prisma.userAccountAssociation.createMany({
    data: seededUsers.map((user) => ({
      ownerId: user.id,
      provider: 'Password',
      identifier: user.email.toLowerCase(),
    })),
  });

  await prisma.planningScenario.create({
    data: {
      name: 'Base Case',
      startYear: new Date().getFullYear(),
      horizonYears: 20,
      baseNetWorth: 0,
      baseLiquidity: 0,
      inputs: {
        annualIncome: 1_200_000,
        annualSpending: 800_000,
        taxRate: 0.35,
        growthRate: 0.05,
        opcosPct: 0,
      },
      events: [],
      ownerId: adminUser.id,
    },
  });

  await prisma.financialProfile.create({
    data: {
      ownerId: adminUser.id,
      baseNetWorth: 0,
      baseLiquidity: 0,
      assumptions: {
        taxRate: 0.35,
        taxBasis: 'gross_income',
      },
    },
  });

  await prisma.planningCashflowItem.createMany({
    data: [
      {
        ownerId: adminUser.id,
        kind: 'Income',
        name: 'Portfolio Income',
        amount: 1_200_000,
        startYear: new Date().getFullYear(),
        endYear: new Date().getFullYear() + 20,
      },
      {
        ownerId: adminUser.id,
        kind: 'Outflow',
        name: 'Baseline Spending',
        amount: 800_000,
        startYear: new Date().getFullYear(),
        endYear: new Date().getFullYear() + 20,
      },
    ],
  });

  const year = new Date().getFullYear();
  await prisma.strategyExposure.createMany({
    data: [
      { ownerId: adminUser.id, strategy: 'Liquidity_Program', capital: 0 },
      { ownerId: adminUser.id, strategy: 'OpCos', capital: 0 },
      { ownerId: adminUser.id, strategy: 'BF_Global', capital: 0 },
      { ownerId: adminUser.id, strategy: 'Opportunities_Fund', capital: 0 },
    ],
  });

  await prisma.strategyBenchmark.createMany({
    data: [
      {
        strategy: 'Liquidity_Program',
        year,
        targetReturnRate: 0.06,
        actualReturnRate: 0.055,
        plannedLiquidityRate: 0.1,
        actualLiquidityRate: 0.09,
      },
      {
        strategy: 'OpCos',
        year,
        targetReturnRate: 0.12,
        actualReturnRate: 0.1,
        plannedLiquidityRate: 0.05,
        actualLiquidityRate: 0.04,
      },
      {
        strategy: 'BF_Global',
        year,
        targetReturnRate: 0.09,
        actualReturnRate: 0.095,
        plannedLiquidityRate: 0.06,
        actualLiquidityRate: 0.07,
      },
      {
        strategy: 'Opportunities_Fund',
        year,
        targetReturnRate: 0.15,
        actualReturnRate: 0.13,
        plannedLiquidityRate: 0.03,
        actualLiquidityRate: 0.025,
      },
    ],
  });

  // eslint-disable-next-line no-console
  console.log('Seeded snapshot', snapshot.id);
  // eslint-disable-next-line no-console
  console.log('Seeded admin user', adminUser.email);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
