-- AlterTable
ALTER TABLE "User" ADD COLUMN     "creditBalancePence" INTEGER NOT NULL DEFAULT 50000;

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "address_line1" VARCHAR(100),
ADD COLUMN     "address_line2" VARCHAR(100),
ADD COLUMN     "delivery_option" VARCHAR(20),
ADD COLUMN     "delivery_price_pence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email" VARCHAR(254),
ADD COLUMN     "first_name" VARCHAR(100),
ADD COLUMN     "last_name" VARCHAR(100),
ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "postcode" VARCHAR(8),
ADD COLUMN     "town" VARCHAR(60);

-- AlterTable
ALTER TABLE "order_products" ADD COLUMN     "unit_price_pence" INTEGER NOT NULL DEFAULT 0;

-- Business rules enforced by the database as a last line of defence.
ALTER TABLE "User" ADD CONSTRAINT "User_creditBalancePence_check" CHECK ("creditBalancePence" >= 0);
ALTER TABLE "order" ADD CONSTRAINT "order_delivery_price_pence_check" CHECK ("delivery_price_pence" >= 0);
ALTER TABLE "order_products" ADD CONSTRAINT "order_products_unit_price_pence_check" CHECK ("unit_price_pence" >= 0);
