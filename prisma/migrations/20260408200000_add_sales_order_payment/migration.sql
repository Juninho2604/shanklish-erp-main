-- CreateTable
CREATE TABLE "SalesOrderPayment" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountUSD" DOUBLE PRECISION NOT NULL,
    "amountBS" DOUBLE PRECISION,
    "exchangeRate" DOUBLE PRECISION,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesOrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesOrderPayment_salesOrderId_idx" ON "SalesOrderPayment"("salesOrderId");

-- AddForeignKey
ALTER TABLE "SalesOrderPayment" ADD CONSTRAINT "SalesOrderPayment_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
