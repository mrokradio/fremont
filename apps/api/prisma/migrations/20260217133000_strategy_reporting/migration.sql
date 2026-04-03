-- CreateTable
CREATE TABLE `StrategyExposure` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `strategy` ENUM('Liquidity_Program', 'OpCos', 'BF_Global', 'Opportunities_Fund') NOT NULL,
    `capital` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StrategyExposure_ownerId_idx`(`ownerId`),
    UNIQUE INDEX `StrategyExposure_ownerId_strategy_key`(`ownerId`, `strategy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StrategyPerformance` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `strategy` ENUM('Liquidity_Program', 'OpCos', 'BF_Global', 'Opportunities_Fund') NOT NULL,
    `year` INTEGER NOT NULL,
    `targetReturn` DOUBLE NOT NULL,
    `actualReturn` DOUBLE NOT NULL,
    `plannedLiquidity` DOUBLE NOT NULL,
    `actualLiquidity` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StrategyPerformance_ownerId_idx`(`ownerId`),
    INDEX `StrategyPerformance_year_idx`(`year`),
    UNIQUE INDEX `StrategyPerformance_ownerId_strategy_year_key`(`ownerId`, `strategy`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StrategyExposure` ADD CONSTRAINT `StrategyExposure_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StrategyPerformance` ADD CONSTRAINT `StrategyPerformance_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
