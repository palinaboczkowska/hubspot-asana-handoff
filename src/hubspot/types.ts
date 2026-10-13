export interface Contact {
  id: string;
  email: string | null;
  name: string | null;
  country: string | null;
  companyId: string | null;
}

export interface Company {
  id: string;
  name: string | null;
  domain: string | null;
  industry: string | null;
  employees: number | null;
  country: string | null;
}

export interface Deal {
  id: string;
  name: string;
  amount: number | null;
  closeDate: string | null;
  ownerId: string | null;
  companyId: string | null;
}

export interface Owner {
  id: string;
  email: string;
  name: string;
}

/** What the handlers need from HubSpot. The real client and the test fake both implement it. */
export interface HubSpotApi {
  getContact(id: string): Promise<Contact>;
  getCompany(id: string): Promise<Company>;
  getDeal(id: string): Promise<Deal>;
  findOwnerByEmail(email: string): Promise<Owner | null>;
  getOwner(id: string): Promise<Owner | null>;
  setContactOwner(contactId: string, ownerId: string): Promise<void>;
  addNote(target: { type: "contact" | "deal"; id: string }, body: string): Promise<void>;
}
