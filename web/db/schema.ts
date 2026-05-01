import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const engineerRoleEnum = pgEnum("engineer_role", [
  "engineer",
  "manager",
  "director",
  "vp",
  "admin",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

export const onboardingStateEnum = pgEnum("onboarding_state", [
  "setup",
  "communication",
  "preview",
  "live",
  "warmup",
  "active",
]);

export const meSchema = pgSchema("me");
export const orgSchema = pgSchema("org");
export const anonSchema = pgSchema("anon");
export const jobsSchema = pgSchema("jobs");
export const onboardingSchema = pgSchema("onboarding");
export const deliverySchema = pgSchema("delivery");

export const meEngineers = meSchema.table(
  "engineers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    authSubject: text("auth_subject"),
    role: engineerRoleEnum("role").notNull().default("engineer"),
    department: text("department").notNull(),
    division: text("division"),
    company: text("company").notNull().default("company"),
    managerEngineerId: text("manager_engineer_id"),
    githubHandle: text("github_handle"),
    linearUserId: text("linear_user_id"),
    slackUserId: text("slack_user_id"),
    calendarEmail: text("calendar_email"),
    externalId: text("external_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("me_engineers_email_idx").on(table.email),
    authSubjectIdx: uniqueIndex("me_engineers_auth_subject_idx").on(table.authSubject),
    githubIdx: index("me_engineers_github_handle_idx").on(table.githubHandle),
    linearIdx: index("me_engineers_linear_user_id_idx").on(table.linearUserId),
    departmentIdx: index("me_engineers_department_idx").on(table.department),
  }),
);

export const meEvents = meSchema.table(
  "events",
  {
    id: text("id").primaryKey(),
    engineerId: text("engineer_id")
      .notNull()
      .references(() => meEngineers.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceScope: text("source_scope").notNull().default("public-org"),
    type: text("type").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    url: text("url"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    engineerTsIdx: index("me_events_engineer_ts_idx").on(table.engineerId, table.ts),
    sourceIdx: index("me_events_source_idx").on(table.source),
  }),
);

export const meCareerGoals = meSchema.table(
  "career_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engineerId: text("engineer_id")
      .notNull()
      .references(() => meEngineers.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    level: text("level"),
    skills: text("skills"),
    growthAreas: text("growth_areas"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    engineerCreatedIdx: index("me_career_goals_engineer_created_idx").on(
      table.engineerId,
      table.createdAt,
    ),
  }),
);

export const meStars = meSchema.table(
  "stars",
  {
    engineerId: text("engineer_id")
      .notNull()
      .references(() => meEngineers.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    starredAt: timestamp("starred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.engineerId, table.eventId] }),
  }),
);

export const meDocuments = meSchema.table(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engineerId: text("engineer_id")
      .notNull()
      .references(() => meEngineers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    engineerKindIdx: index("me_documents_engineer_kind_idx").on(
      table.engineerId,
      table.kind,
    ),
  }),
);

export const meMaterializations = meSchema.table(
  "materializations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engineerId: text("engineer_id")
      .notNull()
      .references(() => meEngineers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull(),
    sourceJobId: uuid("source_job_id"),
    status: text("status").notNull().default("fresh"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    latestIdx: index("me_materializations_latest_idx").on(
      table.engineerId,
      table.kind,
      table.generatedAt,
    ),
  }),
);

export const meAuditEvents = meSchema.table(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engineerId: text("engineer_id")
      .notNull()
      .references(() => meEngineers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    engineerCreatedIdx: index("me_audit_events_engineer_created_idx").on(
      table.engineerId,
      table.createdAt,
    ),
  }),
);

export const meFrictionPrompts = meSchema.table(
  "friction_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engineerId: text("engineer_id")
      .notNull()
      .references(() => meEngineers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    redactedDraft: text("redacted_draft").notNull(),
    signals: jsonb("signals").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    engineerStatusIdx: index("me_friction_prompts_engineer_status_idx").on(
      table.engineerId,
      table.status,
    ),
  }),
);

export const mePersonalOauthConnections = meSchema.table(
  "personal_oauth_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engineerId: text("engineer_id")
      .notNull()
      .references(() => meEngineers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    scopes: text("scopes").array().notNull().default([]),
    status: text("status").notNull().default("connected"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (table) => ({
    engineerProviderIdx: uniqueIndex("me_personal_oauth_engineer_provider_idx").on(
      table.engineerId,
      table.provider,
    ),
  }),
);

export const mePersonalCalendarEvents = meSchema.table(
  "personal_calendar_events",
  {
    id: text("id").primaryKey(),
    engineerId: text("engineer_id")
      .notNull()
      .references(() => meEngineers.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    busyMinutes: integer("busy_minutes").notNull(),
    meetingKind: text("meeting_kind").notNull().default("meeting"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    engineerStartsIdx: index("me_personal_calendar_engineer_starts_idx").on(
      table.engineerId,
      table.startsAt,
    ),
  }),
);

export const orgEvents = orgSchema.table(
  "events",
  {
    id: text("id").primaryKey(),
    engineerId: text("engineer_id").notNull(),
    department: text("department").notNull(),
    division: text("division"),
    company: text("company").notNull().default("company"),
    source: text("source").notNull(),
    type: text("type").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    url: text("url"),
    workType: text("work_type").notNull().default("unclassified"),
    initiative: text("initiative"),
    cycleTimeHours: integer("cycle_time_hours"),
    deploymentStatus: text("deployment_status"),
    aiAssisted: boolean("ai_assisted").notNull().default(false),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeTsIdx: index("org_events_scope_ts_idx").on(
      table.company,
      table.division,
      table.department,
      table.ts,
    ),
    engineerIdx: index("org_events_engineer_idx").on(table.engineerId),
  }),
);

export const orgMetricThemes = orgSchema.table(
  "metric_themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: text("scope_type").notNull(),
    scopeKey: text("scope_key").notNull(),
    title: text("title").notNull(),
    metric: text("metric").notNull(),
    hypothesis: text("hypothesis").notNull(),
    sampleSize: integer("sample_size").notNull(),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeIdx: index("org_metric_themes_scope_idx").on(table.scopeType, table.scopeKey),
  }),
);

export const orgManagerThemeActions = orgSchema.table(
  "manager_theme_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    themeSource: text("theme_source").notNull(),
    themeId: text("theme_id").notNull(),
    managerEngineerId: text("manager_engineer_id").notNull(),
    action: text("action").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    themeIdx: index("org_manager_theme_actions_theme_idx").on(
      table.themeSource,
      table.themeId,
    ),
  }),
);

export const orgSurveys = orgSchema.table("surveys", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  audienceType: text("audience_type").notNull(),
  audienceKey: text("audience_key").notNull(),
  schedule: text("schedule").notNull().default("once"),
  status: text("status").notNull().default("draft"),
  createdByEngineerId: text("created_by_engineer_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgSurveyQuestions = orgSchema.table(
  "survey_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => orgSurveys.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<string[]>(),
    position: integer("position").notNull().default(0),
  },
  (table) => ({
    surveyIdx: index("org_survey_questions_survey_idx").on(table.surveyId),
  }),
);

export const orgDigestConfigs = orgSchema.table("digest_configs", {
  id: text("id").primaryKey().default("manager-weekly"),
  enabledMetrics: text("enabled_metrics").array().notNull().default([]),
  updatedByEngineerId: text("updated_by_engineer_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgManagerSurfaceChanges = orgSchema.table("manager_surface_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  changeType: text("change_type").notNull(),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const anonymousSubmissions = anonSchema.table(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: text("category").notNull(),
    redactedText: text("redacted_text").notNull(),
    originalFingerprint: text("original_fingerprint").notNull(),
    trackingTokenDigest: text("tracking_token_digest").notNull(),
    status: text("status").notNull().default("stored"),
    themeId: uuid("theme_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    trackingIdx: uniqueIndex("anon_submissions_tracking_digest_idx").on(
      table.trackingTokenDigest,
    ),
    categoryIdx: index("anon_submissions_category_idx").on(table.category),
  }),
);

export const anonymousThemes = anonSchema.table(
  "themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: text("scope_type").notNull(),
    scopeKey: text("scope_key").notNull(),
    title: text("title").notNull(),
    compositeExcerpt: text("composite_excerpt").notNull(),
    category: text("category").notNull(),
    sampleCount: integer("sample_count").notNull(),
    newThisWeek: integer("new_this_week").notNull().default(0),
    status: text("status").notNull().default("active"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeIdx: index("anon_themes_scope_idx").on(table.scopeType, table.scopeKey),
  }),
);

export const anonymousSurveyResponses = anonSchema.table(
  "survey_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyId: uuid("survey_id").notNull(),
    questionId: uuid("question_id").notNull(),
    answer: jsonb("answer").$type<Record<string, unknown>>().notNull(),
    trackingTokenDigest: text("tracking_token_digest").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    surveyIdx: index("anon_survey_responses_survey_idx").on(table.surveyId),
  }),
);

export const jobs = jobsSchema.table(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queue: text("queue").notNull().default("default"),
    type: text("type").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    backoffSeconds: integer("backoff_seconds").notNull().default(60),
    idempotencyKey: text("idempotency_key"),
    error: text("error"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pendingIdx: index("jobs_pending_idx").on(table.status, table.runAt),
    idemIdx: uniqueIndex("jobs_idempotency_key_idx").on(table.idempotencyKey),
  }),
);

export const scheduledJobs = jobsSchema.table(
  "scheduled_jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    queue: text("queue").notNull().default("default"),
    schedule: text("schedule").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nextRunIdx: index("scheduled_jobs_next_run_idx").on(table.enabled, table.nextRunAt),
  }),
);

export const onboardingInstallState = onboardingSchema.table("install_state", {
  id: text("id").primaryKey().default("company"),
  state: onboardingStateEnum("state").notNull().default("setup"),
  communicationMarkdown: text("communication_markdown"),
  previewStartedAt: timestamp("preview_started_at", { withTimezone: true }),
  liveStartedAt: timestamp("live_started_at", { withTimezone: true }),
  warmupStartedAt: timestamp("warmup_started_at", { withTimezone: true }),
  activeStartedAt: timestamp("active_started_at", { withTimezone: true }),
  managerWarmupDays: integer("manager_warmup_days").notNull().default(14),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryMessages = deliverySchema.table(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"),
    jobId: uuid("job_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index("delivery_messages_status_idx").on(table.status),
  }),
);

export const anonymousTables = {
  anonymousSubmissions,
  anonymousThemes,
  anonymousSurveyResponses,
};
