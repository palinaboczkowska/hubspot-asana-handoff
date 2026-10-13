import { describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Job } from "../../src/hubspot/events.js";
import { signV3 } from "../../src/hubspot/signature.js";
import { JobQueue } from "../../src/queue/jobQueue.js";
import { createApp } from "../../src/server/app.js";

const secret = "test-secret";
const publicUrl = "https://example.run.app/webhooks/hubspot";

async function withServer(fn: (base: string, jobs: Job[]) => Promise<void>) {
  const jobs: Job[] = [];
  const queue = new JobQueue<Job>(async (job) => void jobs.push(job), {
    maxAttempts: 1,
    baseDelayMs: 0,
  });
  const app = createApp({
    queue,
    clientSecret: secret,
    publicWebhookUrl: publicUrl,
    wonStage: "closedwon",
  });
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}`, jobs);
    await queue.drain();
  } finally {
    server.close();
  }
}

function signedHeaders(body: string) {
  const timestamp = String(Date.now());
  return {
    "Content-Type": "application/json",
    "X-HubSpot-Request-Timestamp": timestamp,
    "X-HubSpot-Signature-v3": signV3(secret, "POST", publicUrl, body, timestamp),
  };
}

describe("POST /webhooks/hubspot", () => {
  it("accepts a signed batch and queues only the events it handles", async () => {
    const body = JSON.stringify([
      { eventId: 1, subscriptionType: "contact.creation", objectId: 101, occurredAt: 1 },
      { eventId: 2, subscriptionType: "company.creation", objectId: 5, occurredAt: 1 },
      {
        eventId: 3,
        subscriptionType: "deal.propertyChange",
        objectId: 900,
        occurredAt: 1,
        propertyName: "dealstage",
        propertyValue: "closedwon",
      },
    ]);
    await withServer(async (base, jobs) => {
      const res = await fetch(`${base}/webhooks/hubspot`, {
        method: "POST",
        headers: signedHeaders(body),
        body,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ accepted: 2, ignored: 1 });
      await new Promise((r) => setTimeout(r, 10));
      expect(jobs.map((j) => j.kind).sort()).toEqual(["handoff-deal", "route-lead"]);
    });
  });

  it("rejects an unsigned request with 401 and queues nothing", async () => {
    await withServer(async (base, jobs) => {
      const res = await fetch(`${base}/webhooks/hubspot`, { method: "POST", body: "[]" });
      expect(res.status).toBe(401);
      expect(jobs).toHaveLength(0);
    });
  });
});
