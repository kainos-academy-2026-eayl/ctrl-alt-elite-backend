-- CreateTable
CREATE TABLE "Product" (
    "id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "unitPricePence" INTEGER NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Basket" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Basket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasketItem" (
    "basketId" TEXT NOT NULL,
    "productId" VARCHAR(100) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BasketItem_pkey" PRIMARY KEY ("basketId","productId")
);

-- AddForeignKey
ALTER TABLE "BasketItem" ADD CONSTRAINT "BasketItem_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "Basket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasketItem" ADD CONSTRAINT "BasketItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Business rules enforced by the database as a last line of defence.
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitPricePence_check" CHECK ("unitPricePence" >= 0);
ALTER TABLE "BasketItem" ADD CONSTRAINT "BasketItem_quantity_check" CHECK ("quantity" BETWEEN 1 AND 99);
