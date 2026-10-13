import "dotenv/config";
import { AsanaClient } from "./asana/client.js";
import type { AsanaApi } from "./asana/types.js";
import { loadRouting, loadTemplate } from "./config.js";
import { FakeAsana } from "./fakes.js";
import { handleJob } from "./handoff/handlers.js";
import { HubSpotClient } from "./hubspot/client.js";
import { InMemoryStore } from "./queue/store.js";

// Runs one job against the real HubSpot API, without webhooks:
//   npm run live -- route <contactId>
//   npm run live -- handoff <dealId>
// Without ASANA_TOKEN the Asana side is a dry run that only prints what it would create.
const [command, id] = process.argv.slice(2);
if ((command !== "route" && command !== "handoff") || !id) {
  console.error("Usage: npm run live -- route <contactId> | handoff <dealId>");
  process.exit(1);
}

const token = process.env.HUBSPOT_TOKEN;
if (!token) {
  console.error("HUBSPOT_TOKEN is missing in .env");
  process.exit(1);
}

const dryAsana = new FakeAsana();
const dryRun = !(process.env.ASANA_TOKEN && process.env.ASANA_TEAM_GID);
const asana: AsanaApi = dryRun
  ? dryAsana
  : new AsanaClient(process.env.ASANA_TOKEN!, process.env.ASANA_TEAM_GID!);

const hubspot = new HubSpotClient(token);
if (dryRun) {
  // No real Asana project exists, so the link note must not be written to the real deal.
  const writeNote = hubspot.addNote.bind(hubspot);
  hubspot.addNote = async (target, body) => {
    if (target.type === "deal") {
      console.log(`(dry run, not saved to HubSpot) note on deal ${target.id}: ${body}`);
      return;
    }
    await writeNote(target, body);
  };
}

await handleJob(
  command === "route"
    ? { kind: "route-lead", eventId: Date.now(), contactId: id }
    : { kind: "handoff-deal", eventId: Date.now(), dealId: id },
  {
    hubspot,
    asana,
    store: new InMemoryStore(),
    routing: loadRouting(),
    template: loadTemplate(),
    log: (message) => console.log(message),
  },
);

if (dryRun && dryAsana.projects.length > 0) {
  console.log("\nAsana dry run (no ASANA_TOKEN), would create:");
  for (const project of dryAsana.projects) {
    console.log(`  Project "${project.name}"`);
    for (const task of dryAsana.tasks) {
      console.log(
        `    - ${task.name}${task.dueOn ? `, due ${task.dueOn}` : ""}${task.assigneeEmail ? `, ${task.assigneeEmail}` : ""}`,
      );
    }
  }
}
