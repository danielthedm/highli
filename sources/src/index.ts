import type { CoreTool } from "ai";
import {
  filterActive,
  activeNames,
  activeTools,
  activeContext,
  type Source,
} from "@highli/core";

import github from "./github.js";
import linear from "./linear.js";
import slack from "./slack.js";
import notion from "./notion.js";
import jira from "./jira.js";
import confluence from "./confluence.js";
import gitlab from "./gitlab.js";
import bitbucket from "./bitbucket.js";
import asana from "./asana.js";
import googleDocs from "./google-docs.js";
import pagerduty from "./pagerduty.js";
import datadog from "./datadog.js";
import claudeLogs from "./claude-logs.js";

export const allSources: Source[] = [
  github,
  linear,
  slack,
  notion,
  jira,
  confluence,
  gitlab,
  bitbucket,
  asana,
  googleDocs,
  pagerduty,
  datadog,
  claudeLogs,
];

export function getActiveSources(): Source[] {
  return filterActive(allSources);
}

export function getActiveSourceNames(): string[] {
  return activeNames(allSources);
}

export function getActiveTools(): Record<string, CoreTool> {
  return activeTools(allSources);
}

export function getSourceContext(): string {
  return activeContext(allSources);
}
