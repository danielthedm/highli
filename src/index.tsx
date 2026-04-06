import "dotenv/config";
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { App } from "./app.js";
import { ReportApp } from "./components/ReportApp.js";
import { SetupWizard } from "./setup/wizard.js";
import { parseDateRange } from "./utils/date.js";

const program = new Command();

program
  .name("highli")
  .description("AI-powered self-performance review assistant")
  .version("0.1.0");

// Interactive review chat
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

// Report command: generate insights report
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
      // Default to last 6 months
      timeframe = parseDateRange("last 6 months");
    }

    render(<ReportApp timeframe={timeframe} />);
  });

// Brag document
program
  .command("brag")
  .description(
    "Generate a brag document — accomplishments, impact, and evidence for reviews and promotions",
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
    "Update the last brag doc with new data since it was generated",
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

      // New data: from last run date to today
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

// Setup wizard
program
  .command("setup")
  .description(
    "Interactive setup wizard — configure data sources and access methods",
  )
  .action(() => {
    render(<SetupWizard />);
  });

// Show help if no command given
program.action(() => {
  program.help();
});

program.parse();
