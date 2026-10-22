-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "description" VARCHAR(1000) NOT NULL DEFAULT '',
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "imageUrl" VARCHAR(500) NOT NULL DEFAULT '/assets/images/placeholder.svg',
ADD COLUMN     "isInStock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
