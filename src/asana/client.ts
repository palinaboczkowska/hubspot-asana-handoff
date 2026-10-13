import { z } from "zod";
import { HttpError, requestJson } from "../http.js";
import type { AsanaApi, AsanaProject } from "./types.js";

const BASE = "https://app.asana.com/api/1.0";

/** Asana REST API with a personal access token. Projects are created in one team. */
export class AsanaClient implements AsanaApi {
  constructor(
    private readonly token: string,
    private readonly teamGid: string,
  ) {}

  async createProject(name: string, notes: string): Promise<AsanaProject> {
    const raw = await requestJson<unknown>(
      `${BASE}/projects?opt_fields=gid,permalink_url`,
      this.token,
      { method: "POST", body: { data: { name, notes, team: this.teamGid } } },
    );
    const { data } = z
      .object({ data: z.object({ gid: z.string(), permalink_url: z.string() }) })
      .parse(raw);
    return { gid: data.gid, url: data.permalink_url };
  }

  async createTask(
    projectGid: string,
    task: {
      name: string;
      notes: string;
      dueOn: string | null;
      assigneeEmail: string | null;
    },
  ): Promise<void> {
    const data = {
      name: task.name,
      notes: task.notes,
      projects: [projectGid],
      ...(task.dueOn ? { due_on: task.dueOn } : {}),
    };
    if (!task.assigneeEmail) {
      await requestJson(`${BASE}/tasks`, this.token, { method: "POST", body: { data } });
      return;
    }
    try {
      await requestJson(`${BASE}/tasks`, this.token, {
        method: "POST",
        body: { data: { ...data, assignee: task.assigneeEmail } },
      });
    } catch (error) {
      // The sales owner may not be in the Asana workspace. Create the task
      // unassigned instead of failing the whole handoff.
      if (!(error instanceof HttpError) || error.status !== 400) throw error;
      await requestJson(`${BASE}/tasks`, this.token, {
        method: "POST",
        body: {
          data: {
            ...data,
            notes: `${task.notes}\nCould not assign to ${task.assigneeEmail}.`,
          },
        },
      });
    }
  }
}
