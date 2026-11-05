-- CreateTable
CREATE TABLE "ProductTranslation" (
    "productId" TEXT NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',

    CONSTRAINT "ProductTranslation_pkey" PRIMARY KEY ("productId","locale")
);

-- CreateIndex
CREATE INDEX "ProductTranslation_locale_idx" ON "ProductTranslation"("locale");

-- AddForeignKey
ALTER TABLE "ProductTranslation" ADD CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
