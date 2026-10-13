export interface AsanaProject {
  gid: string;
  url: string;
}

/** What the handoff needs from Asana. The real client and the test fake both implement it. */
export interface AsanaApi {
  createProject(name: string, notes: string): Promise<AsanaProject>;
  createTask(
    projectGid: string,
    task: {
      name: string;
      notes: string;
      dueOn: string | null;
      assigneeEmail: string | null;
    },
  ): Promise<void>;
}
