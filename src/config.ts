import { readFileSync } from "node:fs";
import { z } from "zod";
import type { AsanaTarget } from "./asana/client.js";
import { HandoffTemplateSchema, type HandoffTemplate } from "./handoff/template.js";
import { RoutingConfigSchema, type RoutingConfig } from "./routing/rules.js";

const EnvSchema = z
  .object({
    PORT: z.coerce.number().default(8080),
    /**
     * The exact public URL of the app webhook endpoint, as HubSpot calls it.
     * It is part of what the signature is computed over, so it has to match.
     */
    PUBLIC_WEBHOOK_URL: z.string().url().optional(),
    HUBSPOT_TOKEN: z.string().min(1),
    /** The HubSpot app's client secret. Only needed for app webhooks. */
    HUBSPOT_CLIENT_SECRET: z.string().min(1).optional(),
    /** Our own secret for workflow webhooks, sent back in X-Webhook-Secret. */
    WORKFLOW_SECRET: z.string().min(16).optional(),
    /** Internal value of the "won" stage in the deal pipeline. */
    HUBSPOT_WON_STAGE: z.string().default("closedwon"),
    ASANA_TOKEN: z.string().min(1),
    /** Set one of these: a team in an organization, or a personal workspace. */
    ASANA_TEAM_GID: z.string().min(1).optional(),
    ASANA_WORKSPACE_GID: z.string().min(1).optional(),
  })
  .refine((env) => env.ASANA_TEAM_GID || env.ASANA_WORKSPACE_GID, {
    message: "Set ASANA_TEAM_GID or ASANA_WORKSPACE_GID",
    path: ["ASANA_TEAM_GID"],
  })
  .refine(
    (env) => env.WORKFLOW_SECRET || (env.PUBLIC_WEBHOOK_URL && env.HUBSPOT_CLIENT_SECRET),
    {
      message:
        "Enable at least one webhook route: WORKFLOW_SECRET, or PUBLIC_WEBHOOK_URL + HUBSPOT_CLIENT_SECRET",
      path: ["WORKFLOW_SECRET"],
    },
  );
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
export function loadRouting(
  path = process.env.ROUTING_FILE ?? "config/routing.json",
): RoutingConfig {
  return RoutingConfigSchema.parse(readJson(path));
}

export function loadTemplate(): HandoffTemplate {
  return HandoffTemplateSchema.parse(readJson("config/handoff.json"));
}

export function asanaTarget(env: {
  ASANA_TEAM_GID?: string;
  ASANA_WORKSPACE_GID?: string;
}): AsanaTarget | null {
  if (env.ASANA_TEAM_GID) return { teamGid: env.ASANA_TEAM_GID };
  if (env.ASANA_WORKSPACE_GID) return { workspaceGid: env.ASANA_WORKSPACE_GID };
  return null;
}
