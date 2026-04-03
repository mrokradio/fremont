-- CreateTable
CREATE TABLE `StrategyBenchmark` (
    `id` VARCHAR(191) NOT NULL,
    `strategy` ENUM('Liquidity_Program', 'OpCos', 'BF_Global', 'Opportunities_Fund') NOT NULL,
    `year` INTEGER NOT NULL,
    `targetReturnRate` DOUBLE NOT NULL,
    `actualReturnRate` DOUBLE NOT NULL,
    `plannedLiquidityRate` DOUBLE NOT NULL,
    `actualLiquidityRate` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StrategyBenchmark_year_idx`(`year`),
    UNIQUE INDEX `StrategyBenchmark_strategy_year_key`(`strategy`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

