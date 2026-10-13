import express from "express";
import { HubSpotEventBatchSchema, jobsFromEvents, type Job } from "../hubspot/events.js";
import { verifyHubSpotSignature } from "../hubspot/signature.js";
import type { JobQueue } from "../queue/jobQueue.js";

export interface AppOptions {
  queue: JobQueue<Job>;
  clientSecret: string;
  publicWebhookUrl: string;
  wonStage: string;
  now?: () => number;
}

export function createApp(options: AppOptions) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ ok: true, deadLetters: options.queue.deadLetters.length });
  });

  // Raw body: the signature is computed over the exact bytes HubSpot sent.
  app.post(
    "/webhooks/hubspot",
    express.text({ type: "*/*", limit: "1mb" }),
    (req, res) => {
      const rawBody = typeof req.body === "string" ? req.body : "";
      const check = verifyHubSpotSignature(
        {
          method: "POST",
          url: options.publicWebhookUrl,
          rawBody,
          signature: req.header("X-HubSpot-Signature-v3"),
          timestamp: req.header("X-HubSpot-Request-Timestamp"),
        },
        options.clientSecret,
        options.now?.() ?? Date.now(),
      );
      if (!check.valid) {
        res.status(401).json({ error: check.reason });
        return;
      }

      let events;
      try {
        events = HubSpotEventBatchSchema.parse(JSON.parse(rawBody));
      } catch {
        res.status(400).json({ error: "Body is not a HubSpot event batch" });
        return;
      }

      // Answer fast; HubSpot retries if we take too long. The work happens in the queue.
      const jobs = jobsFromEvents(events, options.wonStage);
      for (const job of jobs) options.queue.enqueue(job);
      res
        .status(200)
        .json({ accepted: jobs.length, ignored: events.length - jobs.length });
    },
  );

  return app;
}
