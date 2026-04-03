import "dotenv/config";
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { App } from "./app.js";
import { parseDateRange } from "./utils/date.js";

const program = new Command();

program
  .name("highli")
  .description("AI-powered self-performance review assistant")
  .version("0.1.0")
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

program.parse();
