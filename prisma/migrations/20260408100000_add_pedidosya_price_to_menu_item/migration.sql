-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "pedidosYaPrice" DOUBLE PRECISION;
ALTER TABLE "MenuItem" ADD COLUMN "pedidosYaEnabled" BOOLEAN NOT NULL DEFAULT false;
