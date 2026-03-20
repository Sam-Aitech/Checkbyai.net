-- Add CoS beta feature columns to users table
-- cos_beta_enabled: whether the user has access to CoS beta features
-- cos_beta_limit: custom limit for CoS beta verifications (null = default)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cos_beta_enabled" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cos_beta_limit" integer;
