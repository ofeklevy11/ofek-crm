// ============================================
// Meta WhatsApp Cloud API Webhook Payload Types
// ============================================

/** Top-level webhook payload from Meta */
export interface WebhookPayload {
  object: "whatsapp_business_account";
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string; // WABA ID
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: WebhookChangeValue;
  field: "messages";
}

export interface WebhookChangeValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WebhookContact[];
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
  errors?: WebhookError[];
}

export interface WebhookContact {
  profile: { name: string };
  wa_id: string;
}

export interface WebhookMessage {
  from: string; // sender phone number
  id: string; // wamId
  timestamp: string; // Unix timestamp string
  type: WebhookMessageType;
  text?: { body: string };
  image?: WebhookMedia;
  video?: WebhookMedia;
  audio?: WebhookMedia;
  document?: WebhookMedia & { filename?: string };
  sticker?: WebhookMedia;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contacts?: unknown[];
  context?: {
    from: string;
    id: string; // quoted message wamId
  };
  reaction?: {
    message_id: string;
    emoji: string;
  };
}

export type WebhookMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "reaction"
  | "interactive"
  | "button"
  | "order"
  | "unknown";

export interface WebhookMedia {
  id: string; // media ID for download
  mime_type: string;
  sha256: string;
  caption?: string;
}

export interface WebhookStatus {
  id: string; // wamId
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: WebhookError[];
  conversation?: {
    id: string;
    origin: {
      type: "business_initiated" | "user_initiated" | "referral_conversion";
    };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
}

export interface WebhookError {
  code: number;
  title: string;
  message: string;
  error_data?: { details: string };
}

// ============================================
// Embedded Signup Types
// ============================================

export interface EmbeddedSignupResponse {
  code: string; // Authorization code from FB.login
  wabaId?: string; // If returned directly from the signup event
  phoneNumberId?: string;
}

export interface TokenExchangeResponse {
  access_token: string;
  token_type: "bearer";
}

export interface DebugTokenResponse {
  data: {
    app_id: string;
    type: string;
    application: string;
    data_access_expires_at: number;
    expires_at: number;
    is_valid: boolean;
    scopes: string[];
    granular_scopes: {
      scope: string;
      target_ids?: string[];
    }[];
  };
}

// ============================================
// Internal Types
// ============================================

/** Status priority for upgrade-only transitions */
export const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: -1, // FAILED can happen at any stage
};

/** Map from webhook message type to our DB enum */
export function mapMessageType(type: WebhookMessageType): string {
  const map: Record<string, string> = {
    text: "TEXT",
    image: "IMAGE",
    video: "VIDEO",
    audio: "AUDIO",
    document: "DOCUMENT",
    sticker: "STICKER",
    location: "LOCATION",
    contacts: "CONTACTS",
    reaction: "UNKNOWN",
    interactive: "UNKNOWN",
    button: "UNKNOWN",
    order: "UNKNOWN",
    unknown: "UNKNOWN",
  };
  return map[type] || "UNKNOWN";
}

/** Map from webhook status to our DB enum */
export function mapMessageStatus(
  status: "sent" | "delivered" | "read" | "failed",
): string {
  const map: Record<string, string> = {
    sent: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
  };
  return map[status] || "SENT";
}
