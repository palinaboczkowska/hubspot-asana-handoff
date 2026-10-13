import { describe, expect, it } from "vitest";
import { signV3, verifyHubSpotSignature } from "../../src/hubspot/signature.js";

const secret = "test-secret";
const url = "https://example.run.app/webhooks/hubspot";
const body = '[{"eventId":1}]';
const now = 1_760_000_000_000;

function request(overrides: Partial<Parameters<typeof verifyHubSpotSignature>[0]> = {}) {
  const timestamp = String(now);
  return {
    method: "POST",
    url,
    rawBody: body,
    timestamp,
    signature: signV3(secret, "POST", url, body, timestamp),
    ...overrides,
  };
}

describe("verifyHubSpotSignature", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verifyHubSpotSignature(request(), secret, now)).toEqual({ valid: true });
  });

  it("rejects a changed body", () => {
    const result = verifyHubSpotSignature(
      request({ rawBody: '[{"eventId":2}]' }),
      secret,
      now,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifyHubSpotSignature(request(), "other-secret", now).valid).toBe(false);
  });

  it("rejects a request older than five minutes (replay)", () => {
    const result = verifyHubSpotSignature(request(), secret, now + 5 * 60 * 1000 + 1);
    expect(result).toEqual({
      valid: false,
      reason: "Timestamp is missing, invalid or too old",
    });
  });

  it("rejects missing headers", () => {
    expect(
      verifyHubSpotSignature(request({ signature: undefined }), secret, now).valid,
    ).toBe(false);
  });
});
