import { z } from "zod";

export const RoutingRuleSchema = z.object({
  name: z.string(),
  when: z.object({
    countries: z.array(z.string()).optional(),
    industries: z.array(z.string()).optional(),
    minEmployees: z.number().optional(),
    maxEmployees: z.number().optional(),
  }),
  ownerEmail: z.string().email(),
});

export const RoutingConfigSchema = z.object({
  rules: z.array(RoutingRuleSchema),
  fallbackOwnerEmail: z.string().email(),
});
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

export interface LeadFacts {
  country: string | null;
  industry: string | null;
  employees: number | null;
}

export interface RoutingDecision {
  ownerEmail: string;
  ruleName: string;
  reason: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Pure: first matching rule wins, in the order they are written. A rule
 * that needs a fact the lead doesn't have (e.g. no employee count) does
 * not match, so a lead with missing data falls through to the fallback
 * owner instead of being guessed into a segment.
 */
export function routeLead(facts: LeadFacts, config: RoutingConfig): RoutingDecision {
  for (const rule of config.rules) {
    const { countries, industries, minEmployees, maxEmployees } = rule.when;
    const reasons: string[] = [];

    if (countries) {
      if (!facts.country || !countries.some((c) => same(c, facts.country!))) continue;
      reasons.push(`country ${facts.country}`);
    }
    if (industries) {
      if (!facts.industry || !industries.some((i) => same(i, facts.industry!))) continue;
      reasons.push(`industry ${facts.industry}`);
    }
    if (minEmployees !== undefined || maxEmployees !== undefined) {
      if (facts.employees === null) continue;
      if (minEmployees !== undefined && facts.employees < minEmployees) continue;
      if (maxEmployees !== undefined && facts.employees > maxEmployees) continue;
      reasons.push(`${facts.employees} employees`);
    }

    return {
      ownerEmail: rule.ownerEmail,
      ruleName: rule.name,
      reason: reasons.length > 0 ? reasons.join(", ") : "matches every lead",
    };
  }

  return {
    ownerEmail: config.fallbackOwnerEmail,
    ruleName: "fallback",
    reason: "no rule matched",
  };
}
