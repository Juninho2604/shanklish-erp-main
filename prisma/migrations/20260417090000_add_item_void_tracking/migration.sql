-- Add void/soft-delete tracking fields to SalesOrderItem
ALTER TABLE "SalesOrderItem" ADD COLUMN "voidedAt"         TIMESTAMP(3);
ALTER TABLE "SalesOrderItem" ADD COLUMN "voidReason"       TEXT;
ALTER TABLE "SalesOrderItem" ADD COLUMN "voidedByWaiterId" TEXT;
ALTER TABLE "SalesOrderItem" ADD COLUMN "voidedByUserId"   TEXT;
ALTER TABLE "SalesOrderItem" ADD COLUMN "replacedByItemId" TEXT;

ALTER TABLE "SalesOrderItem"
  ADD CONSTRAINT "SalesOrderItem_voidedByWaiterId_fkey"
  FOREIGN KEY ("voidedByWaiterId") REFERENCES "Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesOrderItem"
  ADD CONSTRAINT "SalesOrderItem_voidedByUserId_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesOrderItem"
  ADD CONSTRAINT "SalesOrderItem_replacedByItemId_fkey"
  FOREIGN KEY ("replacedByItemId") REFERENCES "SalesOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SalesOrderItem_voidedAt_idx"         ON "SalesOrderItem"("voidedAt");
CREATE INDEX "SalesOrderItem_voidedByWaiterId_idx" ON "SalesOrderItem"("voidedByWaiterId");
CREATE INDEX "SalesOrderItem_voidedByUserId_idx"   ON "SalesOrderItem"("voidedByUserId");
