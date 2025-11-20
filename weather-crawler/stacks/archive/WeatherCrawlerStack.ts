/**
 * Weather Crawler SST Stack
 *
 * Configures an hourly Cron job that fetches active NWS alerts and ingests them into the database.
 */

import { StackContext, Cron } from "sst/constructs";

export function WeatherCrawlerStack({ stack }: StackContext) {
  // Create a Cron job that runs every hour
  const weatherCrawler = new Cron(stack, "WeatherCrawlerCron", {
    schedule: "rate(1 hour)",
    job: {
      handler: "packages/functions/src/index.handler",
      timeout: "5 minutes",
      memorySize: "512 MB",
      environment: {
        DATABASE_URL: process.env.DATABASE_URL || "",
      },
      // Bundle the CSV file with the function
      nodejs: {
        install: ["pg"],
      },
    },
  });

  stack.addOutputs({
    CronJobName: weatherCrawler.id,
  });
}

