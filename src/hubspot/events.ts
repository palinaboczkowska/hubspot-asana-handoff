import { z } from "zod";

/** One event in the JSON array HubSpot posts to the webhook URL. */
export const HubSpotEventSchema = z.object({
  eventId: z.number(),
  subscriptionType: z.string(),
  objectId: z.number(),
  occurredAt: z.number(),
  propertyName: z.string().optional(),
  propertyValue: z.string().optional(),
  attemptNumber: z.number().optional(),
});
export type HubSpotEvent = z.infer<typeof HubSpotEventSchema>;

export const HubSpotEventBatchSchema = z.array(HubSpotEventSchema);

export type Job =
  | { kind: "route-lead"; eventId: number; contactId: string }
  | { kind: "handoff-deal"; eventId: number; dealId: string };

/** Turns raw events into the jobs this service cares about. Everything else is ignored. */
export function jobsFromEvents(events: HubSpotEvent[], wonStage: string): Job[] {
  const jobs: Job[] = [];
  for (const event of events) {
    if (event.subscriptionType === "contact.creation") {
      jobs.push({
        kind: "route-lead",
        eventId: event.eventId,
        contactId: String(event.objectId),
      });
    } else if (
      event.subscriptionType === "deal.propertyChange" &&
      event.propertyName === "dealstage" &&
      event.propertyValue === wonStage
    ) {
      jobs.push({
        kind: "handoff-deal",
        eventId: event.eventId,
        dealId: String(event.objectId),
      });
    }
  }
  return jobs;
}
