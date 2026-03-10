/**
 * Twilio REST API service layer.
 * Pure fetch()-based (no SDK), consistent with existing service patterns.
 * Credentials are passed as arguments — no direct DB or env access.
 */

import { createLogger } from "@/lib/logger";

const log = createLogger("TwilioAPI");

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function basicAuth(accountSid: string, authToken: string): string {
  return "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

// ─── Types ───────────────────────────────────────────────────────

export interface TwilioAccountInfo {
  friendlyName: string;
  status: string; // "active", "suspended", "closed"
  type: string;   // "Full", "Trial"
}

export interface TwilioPhoneNumber {
  sid: string;
  phoneNumber: string; // E.164
  friendlyName: string;
  smsCapable: boolean;
}

export interface TwilioSendResult {
  sid: string;
  status: string;
}

// ─── API Functions ───────────────────────────────────────────────

/**
 * Verify Twilio credentials by fetching account info.
 */
export async function verifyCredentials(
  accountSid: string,
  authToken: string,
): Promise<{ valid: boolean; account?: TwilioAccountInfo; error?: string }> {
  try {
    const res = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}.json`, {
      headers: { Authorization: basicAuth(accountSid, authToken) },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Invalid credentials" };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.warn("Twilio account fetch failed", { status: res.status });
      return { valid: false, error: `Twilio API error (${res.status}): ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    return {
      valid: true,
      account: {
        friendlyName: data.friendly_name,
        status: data.status,
        type: data.type,
      },
    };
  } catch (err) {
    log.error("Twilio credential verification failed", { error: String(err) });
    return { valid: false, error: "Could not connect to Twilio API" };
  }
}

/**
 * List phone numbers with SMS capability on the account.
 */
export async function listSmsCapableNumbers(
  accountSid: string,
  authToken: string,
): Promise<TwilioPhoneNumber[]> {
  try {
    const res = await fetch(
      `${TWILIO_API_BASE}/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`,
      {
        headers: { Authorization: basicAuth(accountSid, authToken) },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!res.ok) {
      log.warn("Twilio phone numbers fetch failed", { status: res.status });
      return [];
    }

    const data = await res.json();
    const numbers: TwilioPhoneNumber[] = [];

    for (const num of data.incoming_phone_numbers ?? []) {
      numbers.push({
        sid: num.sid,
        phoneNumber: num.phone_number,
        friendlyName: num.friendly_name,
        smsCapable: !!num.capabilities?.sms,
      });
    }

    return numbers.filter((n) => n.smsCapable);
  } catch (err) {
    log.error("Failed to list Twilio phone numbers", { error: String(err) });
    return [];
  }
}

/**
 * Send an SMS via Twilio.
 */
export async function sendSms(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string,
  statusCallbackUrl?: string,
): Promise<TwilioSendResult> {
  const params = new URLSearchParams();
  params.set("From", from);
  params.set("To", to);
  params.set("Body", body);
  if (statusCallbackUrl) {
    params.set("StatusCallback", statusCallbackUrl);
  }

  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuth(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const code = errData.code ?? res.status;
    const message = errData.message ?? "Twilio send failed";
    log.error("Twilio SMS send failed", { code, message: message.slice(0, 200) });
    throw new TwilioSendError(code, message);
  }

  const data = await res.json();
  return {
    sid: data.sid,
    status: data.status, // "queued", "sent", etc.
  };
}

export class TwilioSendError extends Error {
  constructor(
    public readonly code: number | string,
    message: string,
  ) {
    super(message);
    this.name = "TwilioSendError";
  }
}
