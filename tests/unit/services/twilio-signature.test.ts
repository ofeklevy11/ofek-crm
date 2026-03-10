import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { validateTwilioSignature } from "@/lib/services/twilio-signature";

// Helper to compute a valid Twilio signature for testing
function computeSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return createHmac("sha1", authToken).update(data).digest("base64");
}

describe("validateTwilioSignature", () => {
  const authToken = "test_auth_token_12345";
  const url = "https://example.com/api/webhooks/twilio/status";

  it("validates a correct signature", () => {
    const params = {
      AccountSid: "ACTEST_FAKE_SID_00000000000000000",
      MessageSid: "SM1234567890abcdef1234567890abcdef",
      MessageStatus: "delivered",
    };
    const signature = computeSignature(authToken, url, params);

    expect(validateTwilioSignature(authToken, signature, url, params)).toBe(
      true,
    );
  });

  it("rejects an incorrect signature", () => {
    const params = {
      AccountSid: "ACTEST_FAKE_SID_00000000000000000",
      MessageStatus: "delivered",
    };
    expect(
      validateTwilioSignature(authToken, "invalidbase64sig", url, params),
    ).toBe(false);
  });

  it("rejects when auth token is different", () => {
    const params = { MessageSid: "SM123", MessageStatus: "sent" };
    const signature = computeSignature(authToken, url, params);

    expect(
      validateTwilioSignature("wrong_token", signature, url, params),
    ).toBe(false);
  });

  it("rejects when URL is different", () => {
    const params = { MessageSid: "SM123", MessageStatus: "sent" };
    const signature = computeSignature(authToken, url, params);

    expect(
      validateTwilioSignature(
        authToken,
        signature,
        "https://other.com/webhook",
        params,
      ),
    ).toBe(false);
  });

  it("rejects when params are tampered", () => {
    const params = { MessageSid: "SM123", MessageStatus: "sent" };
    const signature = computeSignature(authToken, url, params);

    const tampered = { ...params, MessageStatus: "failed" };
    expect(validateTwilioSignature(authToken, signature, url, tampered)).toBe(
      false,
    );
  });

  it("handles empty params", () => {
    const params = {};
    const signature = computeSignature(authToken, url, params);

    expect(validateTwilioSignature(authToken, signature, url, params)).toBe(
      true,
    );
  });

  it("sorts parameters correctly", () => {
    const params = {
      Z_param: "last",
      A_param: "first",
      M_param: "middle",
    };
    const signature = computeSignature(authToken, url, params);

    expect(validateTwilioSignature(authToken, signature, url, params)).toBe(
      true,
    );
  });
});
