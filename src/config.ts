import { readFileSync } from "node:fs";
import { z } from "zod";
import { HandoffTemplateSchema, type HandoffTemplate } from "./handoff/template.js";
import { RoutingConfigSchema, type RoutingConfig } from "./routing/rules.js";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  /** The exact public URL of the webhook endpoint, as HubSpot calls it (part of the signature). */
  PUBLIC_WEBHOOK_URL: z.string().url(),
  HUBSPOT_TOKEN: z.string().min(1),
  HUBSPOT_CLIENT_SECRET: z.string().min(1),
  /** Internal value of the "won" stage in the deal pipeline. */
  HUBSPOT_WON_STAGE: z.string().default("closedwon"),
  ASANA_TOKEN: z.string().min(1),
  ASANA_TEAM_GID: z.string().min(1),
});
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${missing}`);
  }
  return parsed.data;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
}

/** Rules and the task template live in config/, so changing them needs no code change. */
export function loadRouting(): RoutingConfig {
  return RoutingConfigSchema.parse(readJson("config/routing.json"));
}

export function loadTemplate(): HandoffTemplate {
  return HandoffTemplateSchema.parse(readJson("config/handoff.json"));
}
