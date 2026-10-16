import express from "express";
import { HubSpotEventBatchSchema, jobsFromEvents, type Job } from "../hubspot/events.js";
import { verifyHubSpotSignature } from "../hubspot/signature.js";
import { checkSharedSecret, workflowJob } from "../hubspot/workflowWebhook.js";
import type { JobQueue } from "../queue/jobQueue.js";

export interface AppOptions {
  queue: JobQueue<Job>;
  /** App webhooks are only served when both of these are set. */
  clientSecret?: string;
  publicWebhookUrl?: string;
  wonStage: string;
  /** Shared secret for the workflow webhook endpoints. Omit to disable them. */
  workflowSecret?: string;
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
      const { clientSecret, publicWebhookUrl } = options;
      if (!clientSecret || !publicWebhookUrl) {
        res.status(404).json({ error: "App webhooks are not enabled" });
        return;
      }
      const rawBody = typeof req.body === "string" ? req.body : "";
      const check = verifyHubSpotSignature(
        {
          method: "POST",
          url: publicWebhookUrl,
          rawBody,
          signature: req.header("X-HubSpot-Signature-v3"),
          timestamp: req.header("X-HubSpot-Request-Timestamp"),
        },
        clientSecret,
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

  // A HubSpot workflow can call these directly, without an app. The workflow
  // sends the record itself, so the object type comes from the path.
  for (const kind of ["contact", "deal"] as const) {
    app.post(`/webhooks/workflow/${kind}`, express.json({ limit: "1mb" }), (req, res) => {
      if (!options.workflowSecret) {
        res.status(404).json({ error: "Workflow webhooks are not enabled" });
        return;
      }
      if (!checkSharedSecret(req.header("X-Webhook-Secret"), options.workflowSecret)) {
        res.status(401).json({ error: "Missing or wrong X-Webhook-Secret header" });
        return;
      }

      const job = workflowJob(kind, req.body);
      if (!job) {
        res.status(400).json({ error: "Could not find a record id in the body" });
        return;
      }
      options.queue.enqueue(job);
      res.status(200).json({ accepted: 1, kind: job.kind });
    });
  }

  return app;
}
