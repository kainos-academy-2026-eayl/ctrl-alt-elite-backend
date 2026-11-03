CREATE TYPE "TicketCategory_new" AS ENUM ('ACCOUNT_ISSUE', 'ORDER_ISSUE', 'DELIVERY_ISSUE', 'RETURNS_REFUNDS', 'PRODUCT_ENQUIRY', 'OTHER');

ALTER TABLE "SupportTicket" ALTER COLUMN "category" TYPE "TicketCategory_new" USING (
    CASE "category"::text
        WHEN 'ORDER' THEN 'ORDER_ISSUE'
        WHEN 'DELIVERY' THEN 'DELIVERY_ISSUE'
        WHEN 'PRODUCT' THEN 'PRODUCT_ENQUIRY'
        ELSE 'OTHER'
    END::"TicketCategory_new"
);

DROP TYPE "TicketCategory";
ALTER TYPE "TicketCategory_new" RENAME TO "TicketCategory";
