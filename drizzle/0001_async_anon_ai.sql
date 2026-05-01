CREATE TABLE "anon"."redaction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_text" text,
	"original_fingerprint" text NOT NULL,
	"preview_only" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"classification" jsonb,
	"stored_submission_id" uuid,
	"tracking_token_digest" text,
	"source_job_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "anon_redaction_requests_status_idx" ON "anon"."redaction_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "anon_redaction_requests_source_job_idx" ON "anon"."redaction_requests" USING btree ("source_job_id");
--> statement-breakpoint
CREATE INDEX "anon_redaction_requests_fingerprint_idx" ON "anon"."redaction_requests" USING btree ("original_fingerprint");
