import { describe, expect, it } from "vitest";
import {
  checkSharedSecret,
  recordIdFromWorkflowBody,
  workflowEventId,
  workflowJob,
} from "../../src/hubspot/workflowWebhook.js";

describe("checkSharedSecret", () => {
  it("accepts the right secret and rejects everything else", () => {
    expect(checkSharedSecret("s3cret", "s3cret")).toBe(true);
    expect(checkSharedSecret("wrong", "s3cret")).toBe(false);
    expect(checkSharedSecret(undefined, "s3cret")).toBe(false);
    expect(checkSharedSecret("s3cre", "s3cret")).toBe(false);
  });
});

describe("recordIdFromWorkflowBody", () => {
  it("finds the id wherever HubSpot puts it", () => {
    expect(recordIdFromWorkflowBody({ objectId: 123 })).toBe("123");
    expect(recordIdFromWorkflowBody({ hs_object_id: "456" })).toBe("456");
    expect(recordIdFromWorkflowBody({ vid: 789 })).toBe("789");
    expect(recordIdFromWorkflowBody({ properties: { hs_object_id: "321" } })).toBe("321");
    expect(
      recordIdFromWorkflowBody({ properties: { hs_object_id: { value: "654" } } }),
    ).toBe("654");
  });

  it("returns null when there is no id, instead of guessing", () => {
    expect(recordIdFromWorkflowBody({ properties: { email: "a@b.c" } })).toBeNull();
    expect(recordIdFromWorkflowBody("not an object")).toBeNull();
  });
});

describe("workflowJob", () => {
  it("builds the right job for each object type", () => {
    expect(workflowJob("contact", { objectId: 111 })).toMatchObject({
      kind: "route-lead",
      contactId: "111",
    });
    expect(workflowJob("deal", { objectId: 222 })).toMatchObject({
      kind: "handoff-deal",
      dealId: "222",
    });
  });

  it("gives the same event id for the same record, so repeats are skipped", () => {
    const a = workflowJob("contact", { objectId: 111 });
    const b = workflowJob("contact", { properties: { hs_object_id: "111" } });
    expect(a?.eventId).toBe(b?.eventId);
    expect(workflowEventId("contact", "111")).not.toBe(workflowEventId("deal", "111"));
  });

  it("returns null when the body has no id", () => {
    expect(workflowJob("contact", {})).toBeNull();
  });
});
