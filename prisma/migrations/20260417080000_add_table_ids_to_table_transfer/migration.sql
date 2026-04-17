-- Add fromTableId and toTableId to TableTransfer for physical table-to-table moves
ALTER TABLE "TableTransfer" ADD COLUMN "fromTableId" TEXT;
ALTER TABLE "TableTransfer" ADD COLUMN "toTableId"   TEXT;

ALTER TABLE "TableTransfer"
  ADD CONSTRAINT "TableTransfer_fromTableId_fkey"
  FOREIGN KEY ("fromTableId") REFERENCES "TableOrStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TableTransfer"
  ADD CONSTRAINT "TableTransfer_toTableId_fkey"
  FOREIGN KEY ("toTableId") REFERENCES "TableOrStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TableTransfer_fromTableId_idx" ON "TableTransfer"("fromTableId");
CREATE INDEX "TableTransfer_toTableId_idx"   ON "TableTransfer"("toTableId");
