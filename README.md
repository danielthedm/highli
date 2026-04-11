# highli

AI powered CLI tool that helps you write self-performance reviews by pulling real data from your work tools and iterating with you in a chat interface.

## TL;DR

```bash
npm install -g highli                          # install
cp .env.example .env                          # add your API keys
highli setup                                  # connect your data sources
highli brag --all                              # generate a brag doc to see what you've done
highli brag --amend                            # update your last brag doc with new data
highli report-on --timeframe "Q1 2026"        # generate a report about a direct report
highli peer-review --timeframe "Q1 2026"      # collab log with a peer, then optional chat to draft the review
highli review --timeframe "last 6 months"     # start your self-review with that context
```

## How it works

1. Launch highli with a timeframe
2. Paste your review questions (or screenshot the review form)
3. highli connects to your data sources (GitHub, Slack, Linear, Notion) and pulls your contributions
4. It drafts answers using real evidence, asks for context it can't find, and iterates with you
5. Export your final review to a file or clipboard

## Quick start

```bash
# Install dependencies
npm install

# Copy .env and add your API keys
cp .env.example .env

# Run the setup wizard to configure data sources
npm run dev -- setup

# Start a review session
npm run dev -- review --timeframe "last 6 months"
```

## Configuration

### AI Provider

Set in `.env`:

```
AI_PROVIDER=anthropic          # or "openai"
AI_MODEL=claude-sonnet-4-20250514  # or "gpt-4o"
ANTHROPIC_API_KEY=sk-ant-...
```

### Data Sources

All optional — highli works with whatever you connect:

| Source | Env Var | What it pulls |
|--------|---------|---------------|
| GitHub | `GITHUB_TOKEN` | PRs authored, code reviews given, commit activity |
| Slack | `SLACK_TOKEN` | Messages, channel activity, thread participation |
| Linear | `LINEAR_API_KEY` | Completed issues, project contributions |
| Notion | `NOTION_TOKEN` | Pages created/edited, document content |
| Jira | `JIRA_TOKEN` | Issues completed, sprint contributions, epics owned |
| Confluence | `CONFLUENCE_TOKEN` | Pages authored, documentation contributions |
| GitLab | `GITLAB_TOKEN` | MRs merged, code reviews, pipeline activity |
| Bitbucket | `BITBUCKET_TOKEN` | PRs, commits, repository contributions |
| Asana | `ASANA_TOKEN` | Tasks completed, projects contributed to |
| Google Docs | `GOOGLE_TOKEN` | Docs created/edited, comments, collaboration |
| PagerDuty | `PAGERDUTY_TOKEN` | On-call shifts, incidents responded to |
| Datadog | `DATADOG_API_KEY` | Dashboards created, monitors configured |

> **Note:** All sources above are implemented. Some require additional env vars beyond the token — see `.env.example` for full details (e.g., Jira/Confluence need `_EMAIL` and `_BASE_URL`, Bitbucket needs `_USERNAME` and `_WORKSPACE`).

**GitHub note:** If you don't set `GITHUB_TOKEN`, highli will automatically use your `gh` CLI session (if authenticated). This is useful when your org blocks personal access tokens.

### Persistent config

Settings like your GitHub username, default repos, and Slack user ID are stored in `~/.highli/config.json`.

## Usage

### Commands

#### `highli setup`
Interactive wizard to configure data sources and access methods. Run this first.

```bash
highli setup
```

#### `highli review`
Start an interactive performance review session. Paste your review questions or send a screenshot, and highli gathers data, drafts answers, and iterates with you.

```bash
highli review --timeframe "last 6 months"
highli review --from 2025-10-01 --to 2026-03-31
highli review --timeframe "Q1 2026" --screenshot ~/review-form.png
```

| Flag | Description |
|------|-------------|
| `--from <date>` | Review period start (YYYY-MM-DD) |
| `--to <date>` | Review period end (YYYY-MM-DD) |
| `--timeframe <range>` | Natural language: `"Q1 2026"`, `"last 6 months"`, `"H2 2025"` |
| `--screenshot <path>` | Start with a screenshot of your review form |
| `--verbose` | Debug logging |

**Chat commands** (while in a review session):

| Command | Description |
|---------|-------------|
| `/screenshot <path>` | Send a screenshot of your review form |
| `/export` | Save the draft to `~/.highli/reviews/` and copy to clipboard |
| `/quit` | Exit |

#### `highli report`
Generate an insights report — work patterns, productivity trends, and Claude Code usage analysis.

```bash
highli report --timeframe "Q1 2026"
highli report --from 2025-10-01 --to 2026-03-31
```

| Flag | Description |
|------|-------------|
| `--from <date>` | Report period start (YYYY-MM-DD) |
| `--to <date>` | Report period end (YYYY-MM-DD) |
| `--timeframe <range>` | Natural language timeframe (defaults to last 6 months) |

#### `highli brag`
Generate a brag document — a comprehensive record of accomplishments, impact, and evidence for performance reviews and promotion cases.

```bash
highli brag --timeframe "last 6 months"
highli brag --from 2025-10-01 --to 2026-03-31
```

Use `--amend` to incrementally update your last brag doc with new data since it was generated, rather than starting from scratch:

```bash
highli brag --amend
```

| Flag | Description |
|------|-------------|
| `--from <date>` | Period start (YYYY-MM-DD) |
| `--to <date>` | Period end (YYYY-MM-DD) |
| `--timeframe <range>` | Natural language timeframe (defaults to last 6 months) |
| `--amend` | Update the last brag doc with new data since it was generated |

#### `highli peer-review`
Generate a **neutral collaboration log** between you and a peer — every PR you co-reviewed, shared Linear issue, co-edited Notion doc, and Slack thread you both participated in. After the log, highli asks if you want help writing the actual peer review; if you say yes, it drops into a conversational chat (like `highli review`) where you paste the peer review questions and it drafts answers grounded in the collab log.

```bash
# Interactive — prompts for name and email
highli peer-review --timeframe "Q1 2026"

# With flags — skips prompts
highli peer-review --name "Alex Smith" --email "alex@company.com" --timeframe "last 6 months"
```

| Flag | Description |
|------|-------------|
| `--name <name>` | Peer's full name |
| `--email <email>` | Peer's email address |
| `--from <date>` | Period start (YYYY-MM-DD) |
| `--to <date>` | Period end (YYYY-MM-DD) |
| `--timeframe <range>` | Natural language timeframe (defaults to last 6 months) |

The collab log is saved to `~/.highli/peer-reviews/`. It intentionally stays neutral — evidence only, no evaluation — so you can form your own opinions before drafting the review.

#### `highli report-on`
Generate a report about a direct report's work — accomplishments, impact, and evidence for performance reviews and 1:1s. Resolves the person's identity across all connected sources (GitHub, Linear, Slack, Notion) given their name and email.

```bash
# Interactive — prompts for name and email
highli report-on --timeframe "Q1 2026"

# With flags — skips prompts
highli report-on --name "Jane Doe" --email "jane@company.com" --timeframe "last 3 months"
```

| Flag | Description |
|------|-------------|
| `--name <name>` | Direct report's full name |
| `--email <email>` | Direct report's email address |
| `--from <date>` | Period start (YYYY-MM-DD) |
| `--to <date>` | Period end (YYYY-MM-DD) |
| `--timeframe <range>` | Natural language timeframe (defaults to last 6 months) |

## Adding a data source

highli uses a plugin registry — adding a new source (e.g., Jira) requires **one file** and **one import line**.

### 1. Create `src/sources/jira.ts`

```typescript
import { tool } from "ai";
import { z } from "zod";
import { defineSource } from "./registry.js";
import { formatSourceResult } from "./types.js";

// Your API functions...

export default defineSource({
  name: "Jira",
  envKey: "JIRA_TOKEN",
  description: "Issues, sprints, and project boards",
  tools: {
    jira_get_issues: tool({
      description: "Get Jira issues assigned to the user in a date range",
      parameters: z.object({
        since: z.string().describe("Start date YYYY-MM-DD"),
        until: z.string().describe("End date YYYY-MM-DD"),
      }),
      execute: async (params) => {
        // Call Jira API, return formatted result
      },
    }),
  },
});
```

### 2. Register it in `src/sources/registry.ts`

```typescript
import jira from "./jira.js";
const allSources: Source[] = [github, linear, slack, notion, jira];
```

### 3. Add the env var to `.env.example`

```
JIRA_TOKEN=
```

That's it. The tools, system prompt, and UI all auto-discover from the registry.

## Development

```bash
npm run dev          # Run with tsx (fast)
npm run build        # Build with tsup
npm run typecheck    # Type check
npm run start        # Run built version
```

### Global install

```bash
npm run build && npm link
highli setup
highli review --timeframe "last 6 months"
```

## Stack

- [Ink 5](https://github.com/vadimdemedes/ink) — React for terminal UIs
- [Vercel AI SDK](https://sdk.vercel.ai) — Provider-agnostic AI (Anthropic, OpenAI, etc.)
- [Octokit](https://github.com/octokit/rest.js) — GitHub API
- [@slack/web-api](https://slack.dev/node-slack-sdk/web-api) — Slack API
- [@linear/sdk](https://developers.linear.app/docs/sdk/getting-started) — Linear API
- [@notionhq/client](https://github.com/makenotion/notion-sdk-js) — Notion API
