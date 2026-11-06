-- CreateIndex
CREATE INDEX "order_createdAt_id_idx" ON "order"("createdAt", "id");

-- CreateIndex
CREATE INDEX "order_order_status_createdAt_idx" ON "order"("order_status", "createdAt");
