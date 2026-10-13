import "dotenv/config";
import { AsanaClient } from "../asana/client.js";
import { asanaTarget, loadEnv, loadRouting, loadTemplate } from "../config.js";
import { handleJob } from "../handoff/handlers.js";
import { HubSpotClient } from "../hubspot/client.js";
import type { Job } from "../hubspot/events.js";
import { JobQueue } from "../queue/jobQueue.js";
import { InMemoryStore } from "../queue/store.js";
import { createApp } from "./app.js";

const env = loadEnv();
const deps = {
  hubspot: new HubSpotClient(env.HUBSPOT_TOKEN),
  asana: new AsanaClient(env.ASANA_TOKEN, asanaTarget(env)!),
  store: new InMemoryStore(),
  routing: loadRouting(),
  template: loadTemplate(),
  log: (message: string) => console.log(message),
};

const queue = new JobQueue<Job>((job) => handleJob(job, deps), {
  maxAttempts: 5,
  baseDelayMs: 2000,
});

const app = createApp({
  queue,
  clientSecret: env.HUBSPOT_CLIENT_SECRET,
  publicWebhookUrl: env.PUBLIC_WEBHOOK_URL,
  wonStage: env.HUBSPOT_WON_STAGE,
});

app.listen(env.PORT, () => {
  console.log(`hubspot-asana-handoff listening on :${env.PORT}`);
});
