import { describe, expect, it } from "vitest";
import { routeLead, type RoutingConfig } from "../../src/routing/rules.js";

const config: RoutingConfig = {
  rules: [
    {
      name: "Nordic enterprise",
      when: { countries: ["Sweden", "Norway"], minEmployees: 500 },
      ownerEmail: "anna@example.com",
    },
    { name: "Retail", when: { industries: ["RETAIL"] }, ownerEmail: "erik@example.com" },
    {
      name: "Nordics",
      when: { countries: ["Sweden", "Norway"] },
      ownerEmail: "sara@example.com",
    },
  ],
  fallbackOwnerEmail: "inbound@example.com",
};

describe("routeLead", () => {
  it("uses the first matching rule, in order", () => {
    const decision = routeLead(
      { country: "Sweden", industry: "RETAIL", employees: 900 },
      config,
    );
    expect(decision.ruleName).toBe("Nordic enterprise");
    expect(decision.reason).toBe("country Sweden, 900 employees");
  });

  it("matches country and industry without caring about case", () => {
    expect(
      routeLead({ country: null, industry: "retail", employees: null }, config)
        .ownerEmail,
    ).toBe("erik@example.com");
    expect(
      routeLead({ country: "norway", industry: null, employees: 10 }, config).ruleName,
    ).toBe("Nordics");
  });

  it("does not guess a segment when the employee count is missing", () => {
    const decision = routeLead(
      { country: "Sweden", industry: null, employees: null },
      config,
    );
    expect(decision.ruleName).toBe("Nordics");
  });

  it("falls back when nothing matches", () => {
    const decision = routeLead(
      { country: "Germany", industry: null, employees: 50 },
      config,
    );
    expect(decision).toEqual({
      ownerEmail: "inbound@example.com",
      ruleName: "fallback",
      reason: "no rule matched",
    });
  });
});
