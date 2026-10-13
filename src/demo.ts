import { loadRouting, loadTemplate } from "./config.js";
import { FakeAsana, seedFakeHubSpot } from "./fakes.js";
import { handleJob } from "./handoff/handlers.js";
import { jobsFromEvents, type HubSpotEvent, type Job } from "./hubspot/events.js";
import { JobQueue } from "./queue/jobQueue.js";
import { InMemoryStore } from "./queue/store.js";

// Runs the whole flow against an in-memory HubSpot and Asana. No tokens, no network.
const hubspot = seedFakeHubSpot();
const asana = new FakeAsana();
asana.failNextTasks = 1; // one temporary Asana error, to show the retry
const deps = {
  hubspot,
  asana,
  store: new InMemoryStore(),
  routing: loadRouting(),
  template: loadTemplate(),
  log: (message: string) => console.log(`  ${message}`),
};
const queue = new JobQueue<Job>((job) => handleJob(job, deps), {
  maxAttempts: 3,
  baseDelayMs: 10,
});

const now = Date.now();
const events: HubSpotEvent[] = [
  { eventId: 1, subscriptionType: "contact.creation", objectId: 101, occurredAt: now },
  { eventId: 2, subscriptionType: "contact.creation", objectId: 102, occurredAt: now },
  { eventId: 3, subscriptionType: "contact.creation", objectId: 103, occurredAt: now },
  {
    eventId: 4,
    subscriptionType: "deal.propertyChange",
    objectId: 900,
    occurredAt: now,
    propertyName: "dealstage",
    propertyValue: "closedwon",
  },
  // HubSpot retried event 4: must not create a second project.
  {
    eventId: 4,
    subscriptionType: "deal.propertyChange",
    objectId: 900,
    occurredAt: now,
    propertyName: "dealstage",
    propertyValue: "closedwon",
  },
];

console.log("Processing 5 webhook events (one is a duplicate):\n");
for (const job of jobsFromEvents(events.slice(0, 4), "closedwon")) queue.enqueue(job);
await queue.drain();
for (const job of jobsFromEvents(events.slice(4), "closedwon")) queue.enqueue(job);
await queue.drain();

console.log("\nNotes written to HubSpot:");
for (const note of hubspot.notes) console.log(`  [${note.type} ${note.id}] ${note.body}`);
console.log("\nAsana:");
for (const project of asana.projects) {
  console.log(`  Project "${project.name}"`);
  for (const task of asana.tasks.filter((t) => t.projectGid === project.gid)) {
    console.log(
      `    - ${task.name}${task.dueOn ? `, due ${task.dueOn}` : ""}${task.assigneeEmail ? `, ${task.assigneeEmail}` : ""}`,
    );
  }
}
console.log(`\nDead letters: ${queue.deadLetters.length}`);
