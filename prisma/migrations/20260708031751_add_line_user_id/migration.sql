-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "lineUserId" TEXT;

-- CreateIndex
CREATE INDEX "Expense_lineUserId_idx" ON "Expense"("lineUserId");
