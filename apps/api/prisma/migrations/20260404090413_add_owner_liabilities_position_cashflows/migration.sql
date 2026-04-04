-- AlterTable: add owner field to Position
ALTER TABLE `Position` ADD COLUMN `owner` VARCHAR(191) NULL;

-- CreateTable: PositionCashflow for per-position inception-to-date tracking
CREATE TABLE `PositionCashflow` (
    `id` VARCHAR(191) NOT NULL,
    `positionId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PositionCashflow_positionId_idx`(`positionId`),
    INDEX `PositionCashflow_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: PositionCashflow.positionId -> Position.id
ALTER TABLE `PositionCashflow` ADD CONSTRAINT `PositionCashflow_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `Position`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Liability
CREATE TABLE `Liability` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `balance` DOUBLE NOT NULL,
    `rate` DOUBLE NULL,
    `maturityDate` DATETIME(3) NULL,
    `owner` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Liability_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
