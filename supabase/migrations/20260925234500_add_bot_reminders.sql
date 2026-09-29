-- Migration: Add Telegram bot reminder preferences and event dispatch log
-- NOTE: This migration is prepared for persistent reminder tracking and preferences.
-- Do NOT apply automatically without explicit operator consent.

CREATE TABLE IF NOT EXISTS reminder_preferences (
  user_id BIGINT PRIMARY KEY,
  invoices_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recurrences_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_summary_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_hour INT NOT NULL DEFAULT 9, -- 0-23 in America/Sao_Paulo timezone
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key TEXT UNIQUE NOT NULL, -- e.g. "997305354:invoice:acc_123:2026-10-15:3_days_before"
  user_id BIGINT NOT NULL,
  type TEXT NOT NULL, -- 'invoice', 'recurrence', 'weekly_summary'
  entity_id TEXT,
  target_date TEXT,
  stage TEXT NOT NULL, -- '3_days_before', 'due_day', '1_day_before', 'weekly_monday', 'snoozed'
  status TEXT NOT NULL, -- 'sent', 'dismissed', 'snoozed', 'stale_discarded'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_dedup_key ON reminder_logs(dedup_key);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_user_id ON reminder_logs(user_id);
