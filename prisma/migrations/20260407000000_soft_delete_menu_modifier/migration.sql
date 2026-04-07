-- AlterTable: Soft delete support for MenuModifier
ALTER TABLE "MenuModifier" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MenuModifier_deletedAt_idx" ON "MenuModifier"("deletedAt");
