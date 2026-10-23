-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Uncategorised',
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '';
