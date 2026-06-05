-- Migration: Add is_gap_day column to monitor_job_runs
-- Phase 2 P3: surface gap-day diff runs for observability (audit trail
-- when yesterday's archive was missing and the diff was rebuilt from
-- canonical DB instead of csvdiff).

ALTER TABLE "monitor_job_runs" ADD COLUMN IF NOT EXISTS "is_gap_day" boolean DEFAULT false;
