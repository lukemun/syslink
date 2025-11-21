/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Weather Apps SST Ion Configuration
 * 
 * Purpose:
 * - Defines infrastructure for weather-related applications using SST Ion.
 * - Provisions a Cron job that fetches NWS alerts and ingests them into Postgres.
 * 
 * Usage:
 *   sst dev              # Run locally with hot reload
 *   sst deploy           # Deploy to default (dev) stage
 *   sst deploy --stage production  # Deploy to production
 *   sst remove           # Remove deployed resources
 */

export default $config({
  app(input) {
    return {
      name: "weather-apps",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          profile: "syslink", // Change this to your desired profile
        },
      },
    };
  },

  async run() {
    // Stage helpers
    const isProd = $app.stage === "production";
    const isLocal = $dev;

    // Load environment variables from parent directory
    const { config } = await import("dotenv");
    const { resolve } = await import("path");
    config({ path: resolve(process.cwd(), "../.env") });

    // --- WEATHER CRAWLER CRON ---
    // Fetches active NWS alerts hourly and ingests them into the database
    const weatherCrawler = new sst.aws.Cron("WeatherCrawlerCron", {
      schedule: "rate(1 hour)",
      job: {
        handler: "apps/crawler/src/index.handler",
        timeout: "5 minutes",
        memory: "512 MB",
        environment: {
          DATABASE_URL: process.env.DATABASE_URL || "",
          DATABASE_POOLER_URL: process.env.DATABASE_POOLER_URL || "",
        },
        nodejs: {
          install: ["pg"],
        },
      },
    });

    // --- WEATHER CRAWLER FUNCTION URL ---
    // Manually triggerable version of the weather crawler
    const weatherCrawlerFunction = new sst.aws.Function("WeatherCrawlerFunction", {
      handler: "apps/crawler/src/index.handler",
      url: true,
      timeout: "5 minutes",
      memory: "512 MB",
      environment: {
        DATABASE_URL: process.env.DATABASE_URL || "",
        DATABASE_POOLER_URL: process.env.DATABASE_POOLER_URL || "",
      },
      nodejs: {
        install: ["pg"],
      },
    });

    // --- FUTURE API RESOURCES (not yet implemented) ---
    // To add the API/EventBus from MyStack.ts in the future:
    //
    // const eventBus = new sst.aws.Bus("EventBus");
    //
    // const api = new sst.aws.Function("ApiHandler", {
    //   handler: "packages/functions/src/lambda.handler",
    //   url: true,
    //   link: [eventBus],
    // });
    //
    // eventBus.subscribe("todo.created", {
    //   handler: "packages/functions/src/events/todo-created.handler",
    // });
    //
    // Then add to outputs: { apiUrl: api.url, eventBusName: eventBus.name }

    // --- OUTPUTS ---
    return {
      crawlerSchedule: weatherCrawler.nodes.job.name,
      crawlerUrl: weatherCrawlerFunction.url,
    };
  },
});
