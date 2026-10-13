import { describe, expect, it } from "vitest";
import { FakeAsana, seedFakeHubSpot } from "../../src/fakes.js";
import { handleJob, type Deps } from "../../src/handoff/handlers.js";
import type { Job } from "../../src/hubspot/events.js";
import { JobQueue } from "../../src/queue/jobQueue.js";
import { InMemoryStore } from "../../src/queue/store.js";

function setup() {
  const deps: Deps & { hubspot: ReturnType<typeof seedFakeHubSpot>; asana: FakeAsana } = {
    hubspot: seedFakeHubSpot(),
    asana: new FakeAsana(),
    store: new InMemoryStore(),
    routing: {
      rules: [
        {
          name: "Retail",
          when: { industries: ["RETAIL"] },
          ownerEmail: "erik.retail@example.com",
        },
      ],
      fallbackOwnerEmail: "inbound@example.com",
    },
    template: {
      tasks: [
        { name: "Kick-off", dueInDays: 3, assignTo: "salesOwner" },
        { name: "Collect assets", dueInDays: 5 },
        { name: "Deliver" },
      ],
    },
    log: () => {},
  };
  const queue = new JobQueue<Job>((job) => handleJob(job, deps), {
    maxAttempts: 3,
    baseDelayMs: 0,
  });
  return { deps, queue };
}

const won: Job = { kind: "handoff-deal", eventId: 10, dealId: "900" };

describe("route-lead", () => {
  it("assigns the owner from the rules and explains why in a note", async () => {
    const { deps } = setup();
    await handleJob({ kind: "route-lead", eventId: 1, contactId: "101" }, deps);

    expect(deps.hubspot.ownerAssignments).toEqual([{ contactId: "101", ownerId: "2" }]);
    expect(deps.hubspot.notes[0]?.body).toBe(
      'Routed to Erik Retail by rule "Retail" (industry RETAIL).',
    );
  });

  it("fails loudly when the configured owner doesn't exist in HubSpot", async () => {
    const { deps } = setup();
    deps.routing.fallbackOwnerEmail = "nobody@example.com";
    await expect(
      handleJob({ kind: "route-lead", eventId: 2, contactId: "103" }, deps),
    ).rejects.toThrow("No HubSpot owner with email nobody@example.com");
  });
});

describe("handoff-deal", () => {
  it("creates one Asana project with the template tasks and links it back in HubSpot", async () => {
    const { deps } = setup();
    await handleJob(won, deps);

    expect(deps.asana.projects).toHaveLength(1);
    expect(deps.asana.projects[0]?.name).toBe("Nordic Outdoor AB: Spring campaign 2027");
    expect(deps.asana.tasks.map((t) => [t.name, t.dueOn, t.assigneeEmail])).toEqual([
      ["Kick-off", "2026-10-16", "erik.retail@example.com"],
      ["Collect assets", "2026-10-18", null],
      ["Deliver", null, null],
    ]);
    expect(deps.hubspot.notes).toEqual([
      {
        type: "deal",
        id: "900",
        body: "Handed over to production: https://app.asana.com/0/1000",
      },
    ]);
  });

  it("ignores a duplicate webhook for the same event", async () => {
    const { deps } = setup();
    await handleJob(won, deps);
    await handleJob(won, deps);
    expect(deps.asana.projects).toHaveLength(1);
    expect(deps.asana.tasks).toHaveLength(3);
  });

  it("does not create a second project when the deal is won again later", async () => {
    const { deps } = setup();
    await handleJob(won, deps);
    await handleJob({ ...won, eventId: 11 }, deps);
    expect(deps.asana.projects).toHaveLength(1);
    expect(deps.hubspot.notes).toHaveLength(1);
  });

  it("continues where it stopped after a failure: no second project, no missing task", async () => {
    const { deps, queue } = setup();
    // First task succeeds, then Asana fails once on the second.
    const original = deps.asana.createTask.bind(deps.asana);
    let calls = 0;
    deps.asana.createTask = async (gid, task) => {
      calls += 1;
      if (calls === 2) throw new Error("Asana returned 503");
      return original(gid, task);
    };

    queue.enqueue(won);
    await queue.drain();

    expect(queue.deadLetters).toHaveLength(0);
    expect(deps.asana.projects).toHaveLength(1);
    expect(deps.asana.tasks.map((t) => t.name)).toEqual([
      "Kick-off",
      "Collect assets",
      "Deliver",
    ]);
  });

  it("dead-letters a job that keeps failing instead of losing it", async () => {
    const { deps, queue } = setup();
    deps.asana.failNextTasks = 99;
    queue.enqueue(won);
    await queue.drain();

    expect(queue.deadLetters).toHaveLength(1);
    expect(queue.deadLetters[0]).toMatchObject({
      attempts: 3,
      error: "Asana returned 503",
    });
  });
});
