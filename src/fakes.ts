import type { AsanaApi, AsanaProject } from "./asana/types.js";
import type { Company, Contact, Deal, HubSpotApi, Owner } from "./hubspot/types.js";

/** In-memory HubSpot for tests and the demo. Records every write so tests can check them. */
export class FakeHubSpot implements HubSpotApi {
  contacts = new Map<string, Contact>();
  companies = new Map<string, Company>();
  deals = new Map<string, Deal>();
  owners: Owner[] = [];
  ownerAssignments: { contactId: string; ownerId: string }[] = [];
  notes: { type: string; id: string; body: string }[] = [];

  async getContact(id: string) {
    return required(this.contacts.get(id), `contact ${id}`);
  }
  async getCompany(id: string) {
    return required(this.companies.get(id), `company ${id}`);
  }
  async getDeal(id: string) {
    return required(this.deals.get(id), `deal ${id}`);
  }
  async findOwnerByEmail(email: string) {
    return this.owners.find((o) => o.email === email) ?? null;
  }
  async getOwner(id: string) {
    return this.owners.find((o) => o.id === id) ?? null;
  }
  async setContactOwner(contactId: string, ownerId: string) {
    this.ownerAssignments.push({ contactId, ownerId });
  }
  async addNote(target: { type: "contact" | "deal"; id: string }, body: string) {
    this.notes.push({ ...target, body });
  }
}

export class FakeAsana implements AsanaApi {
  projects: (AsanaProject & { name: string; notes: string })[] = [];
  tasks: {
    projectGid: string;
    name: string;
    dueOn: string | null;
    assigneeEmail: string | null;
  }[] = [];
  /** Makes the next N createTask calls fail, to test retries. */
  failNextTasks = 0;

  async createProject(name: string, notes: string) {
    const gid = String(1000 + this.projects.length);
    const project = { gid, url: `https://app.asana.com/0/${gid}`, name, notes };
    this.projects.push(project);
    return { gid, url: project.url };
  }
  async createTask(
    projectGid: string,
    task: {
      name: string;
      notes: string;
      dueOn: string | null;
      assigneeEmail: string | null;
    },
  ) {
    if (this.failNextTasks > 0) {
      this.failNextTasks -= 1;
      throw new Error("Asana returned 503");
    }
    this.tasks.push({ projectGid, ...task });
  }
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Not found: ${what}`);
  return value;
}

/** A small, made-up CRM: three salespeople, two companies, one contact each, one deal. */
export function seedFakeHubSpot(): FakeHubSpot {
  const hubspot = new FakeHubSpot();
  hubspot.owners = [
    { id: "1", email: "anna.enterprise@example.com", name: "Anna Enterprise" },
    { id: "2", email: "erik.retail@example.com", name: "Erik Retail" },
    { id: "3", email: "sara.nordics@example.com", name: "Sara Nordics" },
    { id: "4", email: "inbound@example.com", name: "Inbound Team" },
  ];
  hubspot.companies.set("c1", {
    id: "c1",
    name: "Nordic Outdoor AB",
    domain: "nordicoutdoor.example",
    industry: "RETAIL",
    employees: 120,
    country: "Sweden",
  });
  hubspot.companies.set("c2", {
    id: "c2",
    name: "Fjord Logistics AS",
    domain: "fjordlogistics.example",
    industry: "LOGISTICS_AND_SUPPLY_CHAIN",
    employees: 2400,
    country: "Norway",
  });
  hubspot.contacts.set("101", {
    id: "101",
    email: "maja@nordicoutdoor.example",
    name: "Maja Lind",
    country: "Sweden",
    companyId: "c1",
  });
  hubspot.contacts.set("102", {
    id: "102",
    email: "ola@fjordlogistics.example",
    name: "Ola Berg",
    country: "Norway",
    companyId: "c2",
  });
  hubspot.contacts.set("103", {
    id: "103",
    email: "someone@unknown.example",
    name: null,
    country: null,
    companyId: null,
  });
  hubspot.deals.set("900", {
    id: "900",
    name: "Spring campaign 2027",
    amount: 250000,
    closeDate: "2026-10-13T00:00:00.000Z",
    ownerId: "2",
    companyId: "c1",
  });
  return hubspot;
}
