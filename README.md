# highli

highli is an engineer-first work memory tool. It pulls evidence from the tools you already use, keeps the raw timeline intact, and helps turn that trail into standups, brag docs, review drafts, and career narrative.

The default experience is solo and local: no login, no server, no company account. Company mode is available for self-hosted highli-core deployments when an org wants shared ingestion, private `/me/*` surfaces, anonymous frustration channels, and aggregate manager views with privacy floors.

## Quick Start

```bash
npm install
cp .env.example .env
npm run highli -- setup
npm run highli -- web
```

Then open `http://localhost:3000`.

For CLI-only use:

```bash
npm run highli -- standup
npm run highli -- brag --all
npm run highli -- review --timeframe "last 6 months"
```

## Modes

### Solo Mode

Solo mode is the default. It stores events and generated documents locally under `~/.highli`, with a SQLite event store.

Use it for:

- daily or weekly standup summaries
- living brag docs
- self-review drafting
- peer-review collaboration logs
- local web views over your own timeline

### Company Mode

Company mode runs the `/web` app as highli-core with Postgres and Drizzle. It keeps personal engineer surfaces under `/me/*`, stores anonymous submissions in identity-free `anon.*` tables, and exposes manager/org aggregate surfaces only through privacy-floor policy.

Company mode is self-hosted and adapter-oriented:

- Postgres is the primary database.
- Jobs use the first-party Postgres queue in `jobs.*`.
- GitHub and Linear ingestion are server-side providers.
- Email, Slack, calendar, and survey delivery currently have dev adapters.
- Anonymous redaction and theme work runs through async materialization jobs with retry/fallback behavior.

## CLI Commands

### `highli setup`

Configure local data sources and access methods.

```bash
npm run highli -- setup
```

### `highli web`

Start the local web app.

```bash
npm run highli -- web
npm run highli -- web --no-open --port 3001
```

### `highli standup`

Generate a copyable Markdown summary of what you did yesterday.

```bash
npm run highli -- standup
npm run highli -- standup --date 2026-04-30
```

### `highli brag`

Generate or update a living brag doc from captured work evidence.

```bash
npm run highli -- brag --all
npm run highli -- brag --timeframe "Q1 2026"
npm run highli -- brag --amend
```

Flags:

| Flag | Description |
| --- | --- |
| `--from <date>` | Period start, `YYYY-MM-DD` |
| `--to <date>` | Period end, `YYYY-MM-DD` |
| `--timeframe <range>` | Natural language timeframe, such as `"Q1 2026"` |
| `--all` | Include all captured history |
| `--amend` | Add new evidence to the last generated brag doc |

### `highli review`

Start an interactive self-review drafting session. Paste review questions or provide a screenshot, and highli drafts from real evidence.

```bash
npm run highli -- review --timeframe "last 6 months"
npm run highli -- review --from 2025-10-01 --to 2026-03-31
npm run highli -- review --timeframe "Q1 2026" --screenshot ~/review-form.png
```

Chat commands inside a review session:

| Command | Description |
| --- | --- |
| `/screenshot <path>` | Attach a screenshot of the review form |
| `/export` | Save the draft to `~/.highli/reviews/` and copy it to the clipboard |
| `/quit` | Exit |

### `highli report`

Generate an insights report over a timeframe.

```bash
npm run highli -- report --timeframe "Q1 2026"
npm run highli -- report --from 2025-10-01 --to 2026-03-31
```

### `highli peer-review`

Generate a neutral collaboration log with a peer, then optionally draft peer-review feedback from that evidence.

```bash
npm run highli -- peer-review --timeframe "Q1 2026"
npm run highli -- peer-review --name "Alex Smith" --email "alex@company.com" --timeframe "last 6 months"
```

### `highli connect`

Connect the CLI to a highli-core company server and upload local personal documents into your company `/me/*` partition.

```bash
npm run highli -- connect http://localhost:3000 --dev-user engineer
```

### `highli disconnect`

Download company documents locally and return the CLI to solo mode.

```bash
npm run highli -- disconnect
```

## Data Sources

All sources are optional. highli works with whatever you connect.

| Source | Env Var | What it pulls |
| --- | --- | --- |
| GitHub | `GITHUB_TOKEN` | PRs authored, code reviews, commits |
| Slack | `SLACK_TOKEN` | Messages, channel activity, threads |
| Linear | `LINEAR_API_KEY` | Completed issues and project work |
| Notion | `NOTION_TOKEN` | Pages and documentation |
| Jira | `JIRA_TOKEN` | Issues, sprints, epics |
| Confluence | `CONFLUENCE_TOKEN` | Pages and documentation |
| GitLab | `GITLAB_TOKEN` | Merge requests, reviews, pipelines |
| Bitbucket | `BITBUCKET_TOKEN` | Pull requests and commits |
| Asana | `ASANA_TOKEN` | Tasks and projects |
| Google Docs | `GOOGLE_TOKEN` | Docs and comments |
| PagerDuty | `PAGERDUTY_TOKEN` | On-call shifts and incidents |
| Datadog | `DATADOG_API_KEY` | Dashboards and monitors |

Some sources require additional env vars. See `.env.example`.

If `GITHUB_TOKEN` is not set, highli can use your authenticated `gh` CLI session when available.

## Web App

The web app lives in `web/` and reads the same local store the CLI populates in solo mode.

```bash
npm run highli -- web
npm -w @highli/web run dev
npm -w @highli/web run build
```

Current web surfaces include:

- home recap and standup summary
- timeline
- inbox/grouping
- living brag doc
- review writer
- documents
- transparency page
- company-mode manager/admin/anonymous surfaces

## Company Mode With Docker

Start Postgres and highli-core:

```bash
docker compose up --build
```

Useful env vars:

```bash
HIGHLI_MODE=company
HIGHLI_DATABASE_URL=postgres://highli:highli@postgres:5432/highli
HIGHLI_DEV_AUTH=true
AUTH_SECRET=dev-secret-change-me
```

Apply migrations directly:

```bash
HIGHLI_DATABASE_URL=postgres://highli:highli@localhost:5432/highli npm run migrate
```

Run one queued job:

```bash
curl -X POST http://localhost:3000/api/jobs/run-once
```

Run the worker loop:

```bash
HIGHLI_MODE=company npm run worker
```

## Development

```bash
npm install
npm run typecheck
npm run build
npm -w @highli/web run build
npm run verify:floor
npm run verify:anon-schema
```

Repo layout:

```text
cli/       Ink CLI and command entrypoint
core/      shared local store, AI helpers, documents, standup summaries
sources/   source adapters and tool registry
web/       Next.js app, company-mode APIs, Drizzle schema
server/    worker entrypoint
scripts/   migrations and verification scripts
drizzle/   generated SQL migrations
```

## Adding A Source

Add a source adapter in `sources/src/`, then export it from `sources/src/index.ts`.

The source registry is shared by the CLI and web app. New sources should expose:

- an env key
- a human-readable description
- AI tools for interactive review/report flows
- optional bulk ingestion for timeline population

Update `.env.example` with any new env vars.

## Privacy Shape

highli is designed around engineer trust:

- solo mode is local and unauthenticated
- company mode keeps personal data under `/me/*`
- anonymous submissions use identity-free `anon.*` tables
- manager views are aggregate-only and gated by floor policy
- AI-heavy work is materialized asynchronously with freshness and fallback status

## Stack

- TypeScript
- Ink
- Next.js
- Postgres
- Drizzle
- Vercel AI SDK
- Octokit
- Linear SDK
