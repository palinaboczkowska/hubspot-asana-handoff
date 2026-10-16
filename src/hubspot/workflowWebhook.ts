import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Job } from "./events.js";

/**
 * A HubSpot workflow's "Send a webhook" action is not signed the way app
 * webhooks are, so the endpoint is protected by a shared secret that we set
 * ourselves and HubSpot sends back in a header.
 */
export function checkSharedSecret(sent: string | undefined, expected: string): boolean {
  if (!sent) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only used in tests and docs: how HubSpot would sign if we ever enable it. */
export function signBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * A workflow webhook posts the enrolled record itself, and the shape differs
 * between object types and HubSpot versions. Rather than guessing one shape,
 * look for the id in every place HubSpot is known to put it.
 */
const WorkflowBodySchema = z.object({
  objectId: z.union([z.number(), z.string()]).optional(),
  hs_object_id: z.union([z.number(), z.string()]).optional(),
  vid: z.union([z.number(), z.string()]).optional(),
  properties: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.null(), z.object({}).passthrough()]),
    )
    .optional(),
});

export function recordIdFromWorkflowBody(raw: unknown): string | null {
  const body = WorkflowBodySchema.safeParse(raw);
  if (!body.success) return null;
  const direct = body.data.objectId ?? body.data.hs_object_id ?? body.data.vid;
  if (direct !== undefined) return String(direct);

  const prop = body.data.properties?.hs_object_id;
  if (typeof prop === "string" || typeof prop === "number") return String(prop);
  // HubSpot sometimes wraps each property as { value: "123" }.
  if (prop && typeof prop === "object" && "value" in prop) {
    const value = (prop as { value: unknown }).value;
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return null;
}

/**
 * A workflow has no event id, and HubSpot can call the same workflow twice for
 * the same record. Deriving the id from the record makes repeats hit the
 * "already processed" check instead of doing the work again.
 */
export function workflowEventId(kind: "contact" | "deal", recordId: string): number {
  const digest = createHmac("sha256", "workflow").update(`${kind}:${recordId}`).digest();
  return digest.readUInt32BE(0);
}

export function workflowJob(kind: "contact" | "deal", raw: unknown): Job | null {
  const id = recordIdFromWorkflowBody(raw);
  if (!id) return null;
  const eventId = workflowEventId(kind, id);
  return kind === "contact"
    ? { kind: "route-lead", eventId, contactId: id }
    : { kind: "handoff-deal", eventId, dealId: id };
}
