-- CreateTable
CREATE TABLE `PortfolioSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `asOf` DATETIME(3) NOT NULL,
    `netWorth` DOUBLE NOT NULL,
    `liquidity` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PortfolioSnapshot_asOf_idx`(`asOf`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AllocationSlice` (
    `id` VARCHAR(191) NOT NULL,
    `snapshotId` VARCHAR(191) NOT NULL,
    `assetClass` VARCHAR(191) NOT NULL,
    `percent` DOUBLE NOT NULL,

    INDEX `AllocationSlice_snapshotId_idx`(`snapshotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cashflow` (
    `id` VARCHAR(191) NOT NULL,
    `snapshotId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `description` VARCHAR(191) NOT NULL,

    INDEX `Cashflow_snapshotId_idx`(`snapshotId`),
    INDEX `Cashflow_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Position` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `assetClass` VARCHAR(191) NOT NULL,
    `value` DOUBLE NOT NULL,
    `costBasis` DOUBLE NULL,
    `irr` DOUBLE NULL,
    `tags` JSON NULL,
    `liquid` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `category` ENUM('Capital_Call', 'Distribution', 'Fee', 'Interest', 'Dividend', 'Transfer', 'Expense', 'Other') NOT NULL,
    `tags` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Transaction_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AllocationSlice` ADD CONSTRAINT `AllocationSlice_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `PortfolioSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cashflow` ADD CONSTRAINT `Cashflow_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `PortfolioSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
