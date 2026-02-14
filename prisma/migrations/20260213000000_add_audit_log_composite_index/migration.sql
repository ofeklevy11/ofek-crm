-- Issue G: Add composite index for multi-event audit log queries
-- Optimizes WHERE recordId IN (...) AND action IN (...) ORDER BY timestamp
CREATE INDEX "AuditLog_recordId_action_timestamp_idx" ON "AuditLog"("recordId", "action", "timestamp");
