CREATE TABLE "pdf_verify_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"originalname" varchar NOT NULL,
	"file_bytes" bytea NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pdf_verify_uploads" ADD CONSTRAINT "pdf_verify_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pdf_verify_uploads_created_at" ON "pdf_verify_uploads" USING btree ("created_at");
