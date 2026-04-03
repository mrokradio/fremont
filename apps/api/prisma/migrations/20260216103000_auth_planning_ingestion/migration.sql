-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'ANALYST', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanningScenario` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startYear` INTEGER NOT NULL,
    `horizonYears` INTEGER NOT NULL,
    `baseNetWorth` DOUBLE NOT NULL,
    `baseLiquidity` DOUBLE NOT NULL,
    `inputs` JSON NOT NULL,
    `events` JSON NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PlanningScenario_ownerId_idx`(`ownerId`),
    INDEX `PlanningScenario_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IngestionJob` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('Position', 'Transaction') NOT NULL,
    `mode` ENUM('APPEND', 'REPLACE') NOT NULL DEFAULT 'APPEND',
    `dryRun` BOOLEAN NOT NULL DEFAULT true,
    `imported` INTEGER NOT NULL DEFAULT 0,
    `errors` JSON NULL,
    `requestedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IngestionJob_requestedById_idx`(`requestedById`),
    INDEX `IngestionJob_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PlanningScenario` ADD CONSTRAINT `PlanningScenario_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IngestionJob` ADD CONSTRAINT `IngestionJob_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
