DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'paid_submissions'
  ) THEN
    ALTER TABLE "paid_submissions" ADD COLUMN IF NOT EXISTS "user_id" varchar;

    BEGIN
      ALTER TABLE "paid_submissions"
        ADD CONSTRAINT "paid_submissions_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;

    EXECUTE 'CREATE INDEX IF NOT EXISTS "idx_paid_submissions_user_id" ON "paid_submissions" ("user_id")';
  END IF;
END
$$;
