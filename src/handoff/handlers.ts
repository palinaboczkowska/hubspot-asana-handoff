import type { AsanaApi } from "../asana/types.js";
import type { Job } from "../hubspot/events.js";
import type { HubSpotApi } from "../hubspot/types.js";
import type { ProcessedStore } from "../queue/store.js";
import { routeLead, type RoutingConfig } from "../routing/rules.js";
import { addDays, type HandoffTemplate } from "./template.js";

export interface Deps {
  hubspot: HubSpotApi;
  asana: AsanaApi;
  store: ProcessedStore;
  routing: RoutingConfig;
  template: HandoffTemplate;
  log: (message: string) => void;
}

export async function handleJob(job: Job, deps: Deps): Promise<void> {
  if (await deps.store.hasEvent(job.eventId)) {
    deps.log(`event ${job.eventId} already processed, skipping`);
    return;
  }
  if (job.kind === "route-lead") {
    await routeNewContact(job.contactId, deps);
  } else {
    await handOffWonDeal(job.dealId, deps);
  }
  // Only marked after success, so a failed job is retried instead of forgotten.
  await deps.store.markEvent(job.eventId);
}

async function routeNewContact(contactId: string, deps: Deps): Promise<void> {
  const contact = await deps.hubspot.getContact(contactId);
  const company = contact.companyId
    ? await deps.hubspot.getCompany(contact.companyId)
    : null;

  const decision = routeLead(
    {
      country: company?.country ?? contact.country,
      industry: company?.industry ?? null,
      employees: company?.employees ?? null,
    },
    deps.routing,
  );

  const owner = await deps.hubspot.findOwnerByEmail(decision.ownerEmail);
  if (!owner) {
    throw new Error(`No HubSpot owner with email ${decision.ownerEmail}`);
  }

  await deps.hubspot.setContactOwner(contact.id, owner.id);
  // The note makes the decision visible in HubSpot, so a salesperson can see why the lead is theirs.
  await deps.hubspot.addNote(
    { type: "contact", id: contact.id },
    `Routed to ${owner.name} by rule "${decision.ruleName}" (${decision.reason}).`,
  );
  deps.log(
    `contact ${contact.id} -> ${owner.email} (${decision.ruleName}: ${decision.reason})`,
  );
}

async function handOffWonDeal(dealId: string, deps: Deps): Promise<void> {
  const deal = await deps.hubspot.getDeal(dealId);
  const company = deal.companyId ? await deps.hubspot.getCompany(deal.companyId) : null;
  const owner = deal.ownerId ? await deps.hubspot.getOwner(deal.ownerId) : null;

  // Progress is saved after every step, so a retry after a failure continues
  // where it stopped: never a second project, never a skipped task.
  let progress = await deps.store.getHandoff(dealId);
  if (!progress) {
    const customer = company?.name ?? "Unknown customer";
    const notes = [
      `Won in HubSpot: ${deal.name}`,
      `Customer: ${customer}${company?.domain ? ` (${company.domain})` : ""}`,
      deal.amount !== null ? `Amount: ${deal.amount}` : null,
      owner ? `Sales owner: ${owner.name} <${owner.email}>` : null,
      `HubSpot deal id: ${deal.id}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    const project = await deps.asana.createProject(`${customer}: ${deal.name}`, notes);
    progress = {
      projectGid: project.gid,
      projectUrl: project.url,
      tasksCreated: 0,
      noteAdded: false,
    };
    await deps.store.saveHandoff(dealId, progress);
  }

  const startDate = deal.closeDate ?? new Date().toISOString();
  const tasks = deps.template.tasks;
  for (let i = progress.tasksCreated; i < tasks.length; i += 1) {
    const task = tasks[i]!;
    await deps.asana.createTask(progress.projectGid, {
      name: task.name,
      notes: `From HubSpot deal "${deal.name}".`,
      dueOn: task.dueInDays !== undefined ? addDays(startDate, task.dueInDays) : null,
      assigneeEmail: task.assignTo === "salesOwner" ? (owner?.email ?? null) : null,
    });
    progress.tasksCreated = i + 1;
    await deps.store.saveHandoff(dealId, progress);
  }

  if (!progress.noteAdded) {
    await deps.hubspot.addNote(
      { type: "deal", id: deal.id },
      `Handed over to production: ${progress.projectUrl}`,
    );
    progress.noteAdded = true;
    await deps.store.saveHandoff(dealId, progress);
  }
  deps.log(`deal ${deal.id} -> Asana project ${progress.projectUrl}`);
}
