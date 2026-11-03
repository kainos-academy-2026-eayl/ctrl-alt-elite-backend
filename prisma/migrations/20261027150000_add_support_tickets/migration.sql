CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "TicketCategory" AS ENUM ('GENERAL', 'ORDER', 'PAYMENT', 'DELIVERY', 'PRODUCT');

CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "description" VARCHAR(10000) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportTicket_subject_check" CHECK (length(btrim("subject")) > 0),
    CONSTRAINT "SupportTicket_description_check" CHECK (length(btrim("description")) > 0)
);

CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(10000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TicketMessage_body_check" CHECK (length(btrim("body")) > 0)
);

CREATE INDEX "SupportTicket_customerId_createdAt_id_idx" ON "SupportTicket"("customerId", "createdAt", "id");
CREATE INDEX "TicketMessage_ticketId_createdAt_id_idx" ON "TicketMessage"("ticketId", "createdAt", "id");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION update_ticket_message_timestamp() RETURNS TRIGGER AS $$
BEGIN
    UPDATE "SupportTicket" SET "updatedAt" = clock_timestamp() WHERE "id" = NEW."ticketId";
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_message_created
AFTER INSERT ON "TicketMessage"
FOR EACH ROW EXECUTE FUNCTION update_ticket_message_timestamp();