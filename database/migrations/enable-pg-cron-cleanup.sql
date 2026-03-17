-- ============================================================
-- MIGRATION: enable-pg-cron-cleanup.sql
-- Fixes BLOCKER 3 from the Launch-Readiness Audit.
--
-- Problem: release_expired_reservations() was defined in
-- schema_additions.sql but its pg_cron schedule was left
-- commented out. Without this schedule:
--   • Ghost reservations from abandoned checkouts accumulate.
--   • get_available_stock() perpetually undercounts inventory.
--   • Products appear "sold out" while units are physically
--     available, directly losing revenue.
--
-- The insert trigger (_cleanup_expired_reservations) only runs
-- when a NEW reservation is inserted, so it does not help for
-- stores with low traffic or long periods between purchases.
--
-- ── HOW TO RUN ───────────────────────────────────────────────
-- 1. In Supabase Dashboard → Database → Extensions
--    search for "pg_cron" and click Enable.
--    (pg_cron is available on all Supabase Pro projects; on
--    Free tier you need to enable it manually per-project.)
--
-- 2. Paste this entire file into the Supabase SQL Editor and
--    click Run.
--
-- 3. Verify the job was created:
--    SELECT * FROM cron.job;
--    You should see a row with jobname='release-expired-reservations'.
-- ============================================================


-- ── Step 1: Enable the pg_cron extension ────────────────────
-- Safe to run even if already enabled (IF NOT EXISTS).
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- ── Step 2: Remove any stale version of this job ────────────
-- Ensures re-running this migration is idempotent.
SELECT cron.unschedule('release-expired-reservations')
WHERE EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'release-expired-reservations'
);


-- ── Step 3: Schedule the cleanup every 5 minutes ────────────
-- release_expired_reservations() deletes rows from
-- stock_reservations WHERE expires_at <= now() and returns
-- the count of deleted rows (INT).
--
-- Cron expression: */5 * * * * = every 5 minutes, 24/7.
-- This is the primary cleanup mechanism.
-- The Vercel Cron job at /api/internal/cleanup-reservations
-- runs on the same schedule as a redundant backup.
SELECT cron.schedule(
    'release-expired-reservations',   -- unique job name
    '*/5 * * * *',                    -- every 5 minutes
    $$SELECT release_expired_reservations()$$
);


-- ── Verification query (run separately to confirm) ──────────
-- SELECT jobid, jobname, schedule, command, active
-- FROM   cron.job
-- WHERE  jobname = 'release-expired-reservations';
