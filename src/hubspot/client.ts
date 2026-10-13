import { z } from "zod";
import { requestJson } from "../http.js";
import type { Company, Contact, Deal, HubSpotApi, Owner } from "./types.js";

const BASE = "https://api.hubapi.com";

// HubSpot-defined association type ids for notes.
const NOTE_TO_CONTACT = 202;
const NOTE_TO_DEAL = 214;

const AssociationsSchema = z
  .object({
    companies: z.object({ results: z.array(z.object({ id: z.string() })) }).optional(),
  })
  .optional();

const ObjectSchema = z.object({
  id: z.string(),
  properties: z.record(z.string(), z.string().nullable().optional()),
  associations: AssociationsSchema,
});

const OwnerSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
});

function text(value: string | null | undefined): string | null {
  return value && value.trim() !== "" ? value.trim() : null;
}

function number(value: string | null | undefined): number | null {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function toOwner(raw: z.infer<typeof OwnerSchema>): Owner {
  const name = [raw.firstName, raw.lastName].filter(Boolean).join(" ");
  return { id: raw.id, email: raw.email, name: name || raw.email };
}

/** HubSpot CRM v3 over REST, authenticated with a private app token. */
export class HubSpotClient implements HubSpotApi {
  constructor(private readonly token: string) {}

  private async getObject(
    type: string,
    id: string,
    properties: string[],
    withCompany: boolean,
  ) {
    const params = new URLSearchParams({ properties: properties.join(",") });
    if (withCompany) params.set("associations", "companies");
    const raw = await requestJson<unknown>(
      `${BASE}/crm/v3/objects/${type}/${id}?${params}`,
      this.token,
    );
    return ObjectSchema.parse(raw);
  }

  async getContact(id: string): Promise<Contact> {
    const o = await this.getObject(
      "contacts",
      id,
      ["email", "firstname", "lastname", "country"],
      true,
    );
    const p = o.properties;
    return {
      id: o.id,
      email: text(p.email),
      name: text([p.firstname, p.lastname].filter(Boolean).join(" ")),
      country: text(p.country),
      companyId: o.associations?.companies?.results[0]?.id ?? null,
    };
  }

  async getCompany(id: string): Promise<Company> {
    const o = await this.getObject(
      "companies",
      id,
      ["name", "domain", "industry", "numberofemployees", "country"],
      false,
    );
    const p = o.properties;
    return {
      id: o.id,
      name: text(p.name),
      domain: text(p.domain),
      industry: text(p.industry),
      employees: number(p.numberofemployees),
      country: text(p.country),
    };
  }

  async getDeal(id: string): Promise<Deal> {
    const o = await this.getObject(
      "deals",
      id,
      ["dealname", "amount", "closedate", "hubspot_owner_id"],
      true,
    );
    const p = o.properties;
    return {
      id: o.id,
      name: text(p.dealname) ?? `Deal ${o.id}`,
      amount: number(p.amount),
      closeDate: text(p.closedate),
      ownerId: text(p.hubspot_owner_id),
      companyId: o.associations?.companies?.results[0]?.id ?? null,
    };
  }

  async findOwnerByEmail(email: string): Promise<Owner | null> {
    const raw = await requestJson<unknown>(
      `${BASE}/crm/v3/owners?${new URLSearchParams({ email })}`,
      this.token,
    );
    const { results } = z.object({ results: z.array(OwnerSchema) }).parse(raw);
    return results[0] ? toOwner(results[0]) : null;
  }

  async getOwner(id: string): Promise<Owner | null> {
    const raw = await requestJson<unknown>(`${BASE}/crm/v3/owners/${id}`, this.token);
    return toOwner(OwnerSchema.parse(raw));
  }

  async setContactOwner(contactId: string, ownerId: string): Promise<void> {
    await requestJson(`${BASE}/crm/v3/objects/contacts/${contactId}`, this.token, {
      method: "PATCH",
      body: { properties: { hubspot_owner_id: ownerId } },
    });
  }

  async addNote(
    target: { type: "contact" | "deal"; id: string },
    body: string,
  ): Promise<void> {
    await requestJson(`${BASE}/crm/v3/objects/notes`, this.token, {
      method: "POST",
      body: {
        properties: { hs_timestamp: new Date().toISOString(), hs_note_body: body },
        associations: [
          {
            to: { id: target.id },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId:
                  target.type === "contact" ? NOTE_TO_CONTACT : NOTE_TO_DEAL,
              },
            ],
          },
        ],
      },
    });
  }
}
