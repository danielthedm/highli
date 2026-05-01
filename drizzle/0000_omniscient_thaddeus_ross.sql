CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE SCHEMA "anon";
--> statement-breakpoint
CREATE SCHEMA "delivery";
--> statement-breakpoint
CREATE SCHEMA "jobs";
--> statement-breakpoint
CREATE SCHEMA "me";
--> statement-breakpoint
CREATE SCHEMA "onboarding";
--> statement-breakpoint
CREATE SCHEMA "org";
--> statement-breakpoint
CREATE TYPE "public"."engineer_role" AS ENUM('engineer', 'manager', 'director', 'vp', 'admin');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."onboarding_state" AS ENUM('setup', 'communication', 'preview', 'live', 'warmup', 'active');--> statement-breakpoint
CREATE TABLE "anon"."submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"redacted_text" text NOT NULL,
	"original_fingerprint" text NOT NULL,
	"tracking_token_digest" text NOT NULL,
	"status" text DEFAULT 'stored' NOT NULL,
	"theme_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anon"."survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" jsonb NOT NULL,
	"tracking_token_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anon"."themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_key" text NOT NULL,
	"title" text NOT NULL,
	"composite_excerpt" text NOT NULL,
	"category" text NOT NULL,
	"sample_count" integer NOT NULL,
	"new_this_week" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"job_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs"."jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" text DEFAULT 'default' NOT NULL,
	"type" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"backoff_seconds" integer DEFAULT 60 NOT NULL,
	"idempotency_key" text,
	"error" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "me"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engineer_id" text NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "me"."career_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engineer_id" text NOT NULL,
	"text" text NOT NULL,
	"level" text,
	"skills" text,
	"growth_areas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "me"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engineer_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "me"."engineers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"auth_subject" text,
	"role" "engineer_role" DEFAULT 'engineer' NOT NULL,
	"department" text NOT NULL,
	"division" text,
	"company" text DEFAULT 'company' NOT NULL,
	"manager_engineer_id" text,
	"github_handle" text,
	"linear_user_id" text,
	"slack_user_id" text,
	"calendar_email" text,
	"external_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "me"."events" (
	"id" text PRIMARY KEY NOT NULL,
	"engineer_id" text NOT NULL,
	"source" text NOT NULL,
	"source_scope" text DEFAULT 'public-org' NOT NULL,
	"type" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "me"."friction_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engineer_id" text NOT NULL,
	"title" text NOT NULL,
	"redacted_draft" text NOT NULL,
	"signals" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "me"."materializations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engineer_id" text NOT NULL,
	"kind" text NOT NULL,
	"value" jsonb NOT NULL,
	"source_job_id" uuid,
	"status" text DEFAULT 'fresh' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "me"."personal_calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"engineer_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"busy_minutes" integer NOT NULL,
	"meeting_kind" text DEFAULT 'meeting' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "me"."personal_oauth_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engineer_id" text NOT NULL,
	"provider" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "me"."stars" (
	"engineer_id" text NOT NULL,
	"event_id" text NOT NULL,
	"starred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stars_engineer_id_event_id_pk" PRIMARY KEY("engineer_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding"."install_state" (
	"id" text PRIMARY KEY DEFAULT 'company' NOT NULL,
	"state" "onboarding_state" DEFAULT 'setup' NOT NULL,
	"communication_markdown" text,
	"preview_started_at" timestamp with time zone,
	"live_started_at" timestamp with time zone,
	"warmup_started_at" timestamp with time zone,
	"active_started_at" timestamp with time zone,
	"manager_warmup_days" integer DEFAULT 14 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org"."digest_configs" (
	"id" text PRIMARY KEY DEFAULT 'manager-weekly' NOT NULL,
	"enabled_metrics" text[] DEFAULT '{}' NOT NULL,
	"updated_by_engineer_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org"."events" (
	"id" text PRIMARY KEY NOT NULL,
	"engineer_id" text NOT NULL,
	"department" text NOT NULL,
	"division" text,
	"company" text DEFAULT 'company' NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text,
	"work_type" text DEFAULT 'unclassified' NOT NULL,
	"initiative" text,
	"cycle_time_hours" integer,
	"deployment_status" text,
	"ai_assisted" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org"."manager_surface_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_type" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org"."manager_theme_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme_source" text NOT NULL,
	"theme_id" text NOT NULL,
	"manager_engineer_id" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org"."metric_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_key" text NOT NULL,
	"title" text NOT NULL,
	"metric" text NOT NULL,
	"hypothesis" text NOT NULL,
	"sample_size" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org"."survey_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org"."surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"audience_type" text NOT NULL,
	"audience_key" text NOT NULL,
	"schedule" text DEFAULT 'once' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_engineer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs"."scheduled_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"queue" text DEFAULT 'default' NOT NULL,
	"schedule" text NOT NULL,
	"payload" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "me"."audit_events" ADD CONSTRAINT "audit_events_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "me"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "me"."career_goals" ADD CONSTRAINT "career_goals_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "me"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "me"."documents" ADD CONSTRAINT "documents_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "me"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "me"."events" ADD CONSTRAINT "events_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "me"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "me"."friction_prompts" ADD CONSTRAINT "friction_prompts_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "me"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "me"."materializations" ADD CONSTRAINT "materializations_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "me"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "me"."personal_calendar_events" ADD CONSTRAINT "personal_calendar_events_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "me"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "me"."personal_oauth_connections" ADD CONSTRAINT "personal_oauth_connections_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "me"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "me"."stars" ADD CONSTRAINT "stars_engineer_id_engineers_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "me"."engineers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org"."survey_questions" ADD CONSTRAINT "survey_questions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "org"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anon_submissions_tracking_digest_idx" ON "anon"."submissions" USING btree ("tracking_token_digest");--> statement-breakpoint
CREATE INDEX "anon_submissions_category_idx" ON "anon"."submissions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "anon_survey_responses_survey_idx" ON "anon"."survey_responses" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "anon_themes_scope_idx" ON "anon"."themes" USING btree ("scope_type","scope_key");--> statement-breakpoint
CREATE INDEX "delivery_messages_status_idx" ON "delivery"."messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_pending_idx" ON "jobs"."jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key_idx" ON "jobs"."jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "me_audit_events_engineer_created_idx" ON "me"."audit_events" USING btree ("engineer_id","created_at");--> statement-breakpoint
CREATE INDEX "me_career_goals_engineer_created_idx" ON "me"."career_goals" USING btree ("engineer_id","created_at");--> statement-breakpoint
CREATE INDEX "me_documents_engineer_kind_idx" ON "me"."documents" USING btree ("engineer_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "me_engineers_email_idx" ON "me"."engineers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "me_engineers_auth_subject_idx" ON "me"."engineers" USING btree ("auth_subject");--> statement-breakpoint
CREATE INDEX "me_engineers_github_handle_idx" ON "me"."engineers" USING btree ("github_handle");--> statement-breakpoint
CREATE INDEX "me_engineers_linear_user_id_idx" ON "me"."engineers" USING btree ("linear_user_id");--> statement-breakpoint
CREATE INDEX "me_engineers_department_idx" ON "me"."engineers" USING btree ("department");--> statement-breakpoint
CREATE INDEX "me_events_engineer_ts_idx" ON "me"."events" USING btree ("engineer_id","ts");--> statement-breakpoint
CREATE INDEX "me_events_source_idx" ON "me"."events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "me_friction_prompts_engineer_status_idx" ON "me"."friction_prompts" USING btree ("engineer_id","status");--> statement-breakpoint
CREATE INDEX "me_materializations_latest_idx" ON "me"."materializations" USING btree ("engineer_id","kind","generated_at");--> statement-breakpoint
CREATE INDEX "me_personal_calendar_engineer_starts_idx" ON "me"."personal_calendar_events" USING btree ("engineer_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "me_personal_oauth_engineer_provider_idx" ON "me"."personal_oauth_connections" USING btree ("engineer_id","provider");--> statement-breakpoint
CREATE INDEX "org_events_scope_ts_idx" ON "org"."events" USING btree ("company","division","department","ts");--> statement-breakpoint
CREATE INDEX "org_events_engineer_idx" ON "org"."events" USING btree ("engineer_id");--> statement-breakpoint
CREATE INDEX "org_manager_theme_actions_theme_idx" ON "org"."manager_theme_actions" USING btree ("theme_source","theme_id");--> statement-breakpoint
CREATE INDEX "org_metric_themes_scope_idx" ON "org"."metric_themes" USING btree ("scope_type","scope_key");--> statement-breakpoint
CREATE INDEX "org_survey_questions_survey_idx" ON "org"."survey_questions" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_next_run_idx" ON "jobs"."scheduled_jobs" USING btree ("enabled","next_run_at");
--> statement-breakpoint
CREATE OR REPLACE VIEW "org"."renderable_scopes" AS
WITH active_engineers AS (
  SELECT id, company, division, department
  FROM me.engineers
  WHERE active = true
),
company_counts AS (
  SELECT company, count(*)::int AS engineer_count
  FROM active_engineers
  GROUP BY company
),
department_counts AS (
  SELECT company, division, department, count(*)::int AS engineer_count
  FROM active_engineers
  GROUP BY company, division, department
),
division_counts AS (
  SELECT company, division, count(*)::int AS engineer_count
  FROM active_engineers
  WHERE division IS NOT NULL
  GROUP BY company, division
)
SELECT 'company'::text AS scope_type, company AS scope_key, company, NULL::text AS division, NULL::text AS department, engineer_count
FROM company_counts
WHERE engineer_count >= 12
UNION ALL
SELECT 'division'::text AS scope_type, division AS scope_key, company, division, NULL::text AS department, engineer_count
FROM division_counts
WHERE engineer_count >= 25
UNION ALL
SELECT 'department'::text AS scope_type, department AS scope_key, company, division, department, engineer_count
FROM department_counts
WHERE engineer_count >= 25;
