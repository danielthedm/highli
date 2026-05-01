import "dotenv/config";
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { App } from "./app.js";
import { ReportApp } from "./components/ReportApp.js";
import { PeerReviewApp } from "./components/PeerReviewApp.js";
import { SetupWizard } from "./setup/wizard.js";
import { FirstSessionApp } from "./components/FirstSessionApp.js";
import { parseDateRange } from "@highli/core";

const program = new Command();

program
  .name("highli")
  .description("highli — career narrative for engineers")
  .version("0.2.0");

program
  .command("review")
  .description("Start an interactive performance review session")
  .option("--from <date>", "Review period start date (YYYY-MM-DD)")
  .option("--to <date>", "Review period end date (YYYY-MM-DD)")
  .option(
    "--timeframe <range>",
    'Natural language timeframe (e.g., "Q1 2026", "last 6 months")',
  )
  .option("--screenshot <path>", "Path to screenshot of review form")
  .option("--verbose", "Enable debug logging")
  .action((options) => {
    let timeframe: { from: string; to: string } | undefined;

    if (options.from && options.to) {
      timeframe = { from: options.from, to: options.to };
    } else if (options.timeframe) {
      timeframe = parseDateRange(options.timeframe);
    }

    render(<App timeframe={timeframe} screenshotPath={options.screenshot} />);
  });

program
  .command("report")
  .description(
    "Generate an insights report — work patterns, productivity trends, and Claude usage analysis",
  )
  .option("--from <date>", "Report period start date (YYYY-MM-DD)")
  .option("--to <date>", "Report period end date (YYYY-MM-DD)")
  .option(
    "--timeframe <range>",
    'Natural language timeframe (e.g., "Q1 2026", "last 6 months")',
  )
  .action((options) => {
    let timeframe: { from: string; to: string };

    if (options.from && options.to) {
      timeframe = { from: options.from, to: options.to };
    } else if (options.timeframe) {
      timeframe = parseDateRange(options.timeframe);
    } else {
      timeframe = parseDateRange("last 6 months");
    }

    render(<ReportApp timeframe={timeframe} />);
  });

program
  .command("brag")
  .description(
    "Generate or refresh the living brag document — grouped accomplishments, impact, and evidence",
  )
  .option("--from <date>", "Period start date (YYYY-MM-DD)")
  .option("--to <date>", "Period end date (YYYY-MM-DD)")
  .option(
    "--timeframe <range>",
    'Natural language timeframe (e.g., "Q1 2026", "last 6 months")',
  )
  .option("--all", "Include all time (no date filter)")
  .option(
    "--amend",
    "Update the living brag doc with new data since it was generated",
  )
  .action(async (options) => {
    if (options.amend) {
      const { readManifest, readLastBrag } = await import(
        "./report/brag-state.js"
      );
      const manifest = await readManifest();
      const existing = await readLastBrag();

      if (!manifest || !existing) {
        console.error(
          "No previous brag doc found. Run `highli brag` first to generate one.",
        );
        process.exit(1);
      }

      const today = new Date().toISOString().split("T")[0];
      const timeframe = { from: manifest.lastRunDate, to: today };

      render(
        <ReportApp
          timeframe={timeframe}
          mode="brag-amend"
          existingBrag={existing}
        />,
      );
      return;
    }

    let timeframe: { from: string; to: string };

    if (options.from && options.to) {
      timeframe = { from: options.from, to: options.to };
    } else if (options.timeframe) {
      timeframe = parseDateRange(options.timeframe);
    } else if (options.all) {
      const today = new Date().toISOString().split("T")[0];
      timeframe = { from: "2000-01-01", to: today };
    } else {
      console.error(
        "Error: a timeframe is required.\n\n" +
          "  --timeframe <range>   e.g. \"Q1 2026\", \"last 6 months\"\n" +
          "  --from <date> --to <date>   explicit date range (YYYY-MM-DD)\n" +
          "  --all                 all time\n",
      );
      process.exit(1);
    }

    render(<ReportApp timeframe={timeframe} mode="brag" />);
  });

program
  .command("peer-review")
  .description(
    "Generate a neutral collaboration log with a peer, then optionally chat to write their peer review",
  )
  .option("--name <name>", "Peer's full name")
  .option("--email <email>", "Peer's email address")
  .option("--from <date>", "Period start date (YYYY-MM-DD)")
  .option("--to <date>", "Period end date (YYYY-MM-DD)")
  .option(
    "--timeframe <range>",
    'Natural language timeframe (e.g., "Q1 2026", "last 6 months")',
  )
  .action((options) => {
    let timeframe: { from: string; to: string };

    if (options.from && options.to) {
      timeframe = { from: options.from, to: options.to };
    } else if (options.timeframe) {
      timeframe = parseDateRange(options.timeframe);
    } else {
      timeframe = parseDateRange("last 6 months");
    }

    render(
      <PeerReviewApp
        timeframe={timeframe}
        name={options.name}
        email={options.email}
      />,
    );
  });

program
  .command("setup")
  .description(
    "Interactive setup wizard — configure data sources and access methods",
  )
  .action(() => {
    render(<SetupWizard />);
  });

program
  .command("web")
  .description("Start the highli web app (engineer view + transparency page)")
  .option("--no-open", "do not open the browser")
  .option("-p, --port <port>", "port", "3000")
  .action(async (options) => {
    const { spawn } = await import("child_process");
    const { fileURLToPath } = await import("url");
    const { dirname, resolve } = await import("path");
    const here = dirname(fileURLToPath(import.meta.url));
    const webDir = resolve(here, "..", "..", "web");

    const child = spawn(
      "npx",
      ["next", "dev", "-p", String(options.port)],
      { cwd: webDir, stdio: "inherit", env: process.env },
    );

    if (options.open !== false) {
      const url = `http://localhost:${options.port}`;
      const opener =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      setTimeout(() => {
        spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
      }, 1500);
    }

    child.on("exit", (code) => process.exit(code ?? 0));
  });

// Hidden command: invoked by FirstSessionApp as a detached child process to
// drain the engineer's full GitHub history into the local store.
program
  .command("pull-history", { hidden: true })
  .option("--log <path>", "log file path")
  .action(async (options) => {
    const { writeFileSync, appendFileSync, mkdirSync } = await import("fs");
    const { dirname } = await import("path");
    const { ingestRange } = await import("@highli/core");
    const { allSources } = await import("@highli/sources");

    const logPath = options.log as string | undefined;
    const log = (line: string) => {
      const entry = `${new Date().toISOString()} ${line}\n`;
      if (logPath) {
        mkdirSync(dirname(logPath), { recursive: true });
        appendFileSync(logPath, entry);
      } else {
        process.stdout.write(entry);
      }
    };

    if (logPath) {
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileSync(logPath, "");
    }
    log("background pull starting");

    const today = new Date().toISOString().split("T")[0];
    const start = "2010-01-01";
    try {
      const summary = await ingestRange(allSources, start, today, "full-history", (p) => {
        log(`${p.source} ${p.status}${p.inserted != null ? ` inserted=${p.inserted}` : ""}${p.error ? ` error=${p.error}` : ""}`);
      });
      log(`background pull done — totalInserted=${summary.totalInserted}`);
    } catch (err: any) {
      log(`background pull failed: ${err?.message ?? String(err)}`);
      process.exit(1);
    }
  });

// No-arg `highli` runs the first-session flow per the redesign plan:
// detect sources, pull the last 30 days, render the summary + AI insight,
// and offer a background full-history pull.
program.action(() => {
  render(<FirstSessionApp />);
});

program.parse();
