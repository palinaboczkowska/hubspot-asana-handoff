import { createHmac, timingSafeEqual } from "node:crypto";

/** HubSpot rejects anything older than five minutes, so do we (replay protection). */
export const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export interface SignedRequest {
  method: string;
  /** The full public URL HubSpot called, e.g. https://example.run.app/webhooks/hubspot */
  url: string;
  rawBody: string;
  signature: string | undefined;
  timestamp: string | undefined;
}

export type SignatureCheck = { valid: true } | { valid: false; reason: string };

/**
 * HubSpot webhook signature, version 3: base64 of HMAC-SHA256 over
 * method + url + body + timestamp, keyed with the app's client secret.
 */
export function signV3(
  secret: string,
  method: string,
  url: string,
  rawBody: string,
  timestamp: string,
): string {
  return createHmac("sha256", secret)
    .update(`${method}${url}${rawBody}${timestamp}`)
    .digest("base64");
}

export function verifyHubSpotSignature(
  request: SignedRequest,
  secret: string,
  now: number = Date.now(),
): SignatureCheck {
  if (!request.signature || !request.timestamp) {
    return { valid: false, reason: "Missing signature or timestamp header" };
  }

  const sentAt = Number(request.timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > MAX_SIGNATURE_AGE_MS) {
    return { valid: false, reason: "Timestamp is missing, invalid or too old" };
  }

  const expected = Buffer.from(
    signV3(secret, request.method, request.url, request.rawBody, request.timestamp),
  );
  const received = Buffer.from(request.signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { valid: false, reason: "Signature does not match" };
  }
  return { valid: true };
}
