-- AlterTable: add strategy field to Position
-- Links each position to one of the four investment strategies
ALTER TABLE `Position`
  ADD COLUMN `strategy` ENUM('Liquidity_Program','OpCos','BF_Global','Opportunities_Fund') NULL,
  ADD INDEX `Position_strategy_idx` (`strategy`);
