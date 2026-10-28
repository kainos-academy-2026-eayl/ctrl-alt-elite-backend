CREATE SEQUENCE "ticket_number_seq" START 1001;

WITH numbered AS (
    SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn
    FROM "SupportTicket"
)
UPDATE "SupportTicket" AS t
SET "id" = 'T-' || (1000 + numbered.rn)::text
FROM numbered
WHERE t."id" = numbered."id";

SELECT setval('ticket_number_seq', 1000 + (SELECT count(*) FROM "SupportTicket"), true);

ALTER TABLE "SupportTicket"
    ALTER COLUMN "id" SET DEFAULT ('T-' || nextval('ticket_number_seq')::text);
