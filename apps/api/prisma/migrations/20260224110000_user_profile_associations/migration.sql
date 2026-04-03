-- CreateTable
CREATE TABLE `UserContactProfile` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `secondaryEmail` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `company` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserContactProfile_ownerId_key`(`ownerId`),
    INDEX `UserContactProfile_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserAccountAssociation` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `provider` ENUM('Password', 'Google', 'Microsoft') NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserAccountAssociation_ownerId_provider_identifier_key`(`ownerId`, `provider`, `identifier`),
    INDEX `UserAccountAssociation_ownerId_idx`(`ownerId`),
    INDEX `UserAccountAssociation_ownerId_provider_idx`(`ownerId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserContactProfile` ADD CONSTRAINT `UserContactProfile_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAccountAssociation` ADD CONSTRAINT `UserAccountAssociation_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
