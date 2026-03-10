import { createLogger } from "@/lib/logger";

const log = createLogger("WhatsAppCloudAPI");

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";
const MAX_MEDIA_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB (Meta's own limit is 100 MB)

interface SendMessageResult {
  messageId: string;
}

interface MediaUrlResult {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
}

/**
 * Send a free-form text message via WhatsApp Cloud API.
 */
export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string,
): Promise<SendMessageResult> {
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    log.error("sendTextMessage failed", {
      status: res.status,
      body: err.slice(0, 200),
    });
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  const data = await res.json();
  const messageId = data.messages?.[0]?.id;
  if (!messageId) {
    log.error("sendTextMessage: no message ID in response", { data });
    throw new Error("WhatsApp API returned no message ID");
  }
  return { messageId };
}

/**
 * Send a media message (image, video, audio, document).
 */
export async function sendMediaMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  type: "image" | "video" | "audio" | "document",
  mediaUrl: string,
  caption?: string,
  filename?: string,
): Promise<SendMessageResult> {
  const mediaPayload: Record<string, string> = { link: mediaUrl };
  if (caption) mediaPayload.caption = caption;
  if (filename && type === "document") mediaPayload.filename = filename;

  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type,
      [type]: mediaPayload,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    log.error("sendMediaMessage failed", {
      status: res.status,
      body: err.slice(0, 200),
    });
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  const data = await res.json();
  const messageId = data.messages?.[0]?.id;
  if (!messageId) {
    log.error("sendMediaMessage: no message ID in response", { data });
    throw new Error("WhatsApp API returned no message ID");
  }
  return { messageId };
}

/**
 * Send a pre-approved template message (for outside the 24-hour window).
 */
export async function sendTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  languageCode: string,
  components?: unknown[],
): Promise<SendMessageResult> {
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };
  if (components?.length) {
    template.components = components;
  }

  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    log.error("sendTemplateMessage failed", {
      status: res.status,
      body: err.slice(0, 200),
    });
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  const data = await res.json();
  const messageId = data.messages?.[0]?.id;
  if (!messageId) {
    log.error("sendTemplateMessage: no message ID in response", { data });
    throw new Error("WhatsApp API returned no message ID");
  }
  return { messageId };
}

/**
 * Retrieve the download URL of a media object by its Meta media ID.
 */
export async function getMediaUrl(
  mediaId: string,
  accessToken: string,
): Promise<MediaUrlResult> {
  const res = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    log.error("getMediaUrl failed", {
      status: res.status,
      body: err.slice(0, 200),
    });
    throw new Error(`WhatsApp API error: ${res.status}`);
  }

  return await res.json();
}

/**
 * Download media binary from a Meta-provided URL.
 */
export async function downloadMedia(
  mediaUrl: string,
  accessToken: string,
): Promise<Buffer> {
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    log.error("downloadMedia failed", { status: res.status });
    throw new Error(`Media download failed: ${res.status}`);
  }

  const contentLength = Number(res.headers.get("content-length") || "0");
  if (contentLength > MAX_MEDIA_SIZE_BYTES) {
    throw new Error(`Media too large: ${contentLength} bytes (max ${MAX_MEDIA_SIZE_BYTES})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_MEDIA_SIZE_BYTES) {
    throw new Error(`Media too large: ${arrayBuffer.byteLength} bytes (max ${MAX_MEDIA_SIZE_BYTES})`);
  }
  return Buffer.from(arrayBuffer);
}

/**
 * Mark a message as read (sends blue checkmarks to the sender).
 */
export async function markMessageAsRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    log.error("markMessageAsRead failed", { status: res.status, body: err.slice(0, 200) });
    throw new Error(`markMessageAsRead failed: ${res.status}`);
  }
}
