-- AlterTable
ALTER TABLE "OpenTab" ADD COLUMN "waiterProfileId" TEXT;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "waiterProfileId" TEXT;

-- CreateIndex
CREATE INDEX "OpenTab_waiterProfileId_idx" ON "OpenTab"("waiterProfileId");

-- CreateIndex
CREATE INDEX "SalesOrder_waiterProfileId_idx" ON "SalesOrder"("waiterProfileId");

-- AddForeignKey
ALTER TABLE "OpenTab" ADD CONSTRAINT "OpenTab_waiterProfileId_fkey" FOREIGN KEY ("waiterProfileId") REFERENCES "Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_waiterProfileId_fkey" FOREIGN KEY ("waiterProfileId") REFERENCES "Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
