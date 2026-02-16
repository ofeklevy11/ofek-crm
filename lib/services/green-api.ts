import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("GreenApiService");

const GREEN_API_BASE_URL = "https://api.green-api.com";

export async function sendGreenApiMessage(
  companyId: number,
  to: string,
  message: string,
) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { greenApiInstanceId: true, greenApiToken: true },
  });

  if (!company?.greenApiInstanceId || !company?.greenApiToken) {
    throw new Error("Green API not connected for this company");
  }

  const { greenApiInstanceId, greenApiToken } = company;

  const chatId = formatGreenApiPhone(to);

  const url = `${GREEN_API_BASE_URL}/waInstance${greenApiInstanceId}/sendMessage/${greenApiToken}`;

  const payload = {
    chatId: chatId,
    message: message,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error("Green API send error", { status: res.status, body: err.slice(0, 100) });
    throw new Error("Failed to send WhatsApp message");
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Green API returned unexpected content-type: ${contentType.split(";")[0]}`);
  }

  return await res.json();
}

export async function sendGreenApiFile(
  companyId: number,
  to: string,
  fileUrl: string,
  fileName: string,
  caption?: string,
) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { greenApiInstanceId: true, greenApiToken: true },
  });

  if (!company?.greenApiInstanceId || !company?.greenApiToken) {
    throw new Error("Green API not connected for this company");
  }

  const { greenApiInstanceId, greenApiToken } = company;

  const chatId = formatGreenApiPhone(to);

  const url = `${GREEN_API_BASE_URL}/waInstance${greenApiInstanceId}/sendFileByUrl/${greenApiToken}`;

  const payload = {
    chatId: chatId,
    urlFile: fileUrl,
    fileName: fileName,
    caption: caption,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error("Green API send file error", { status: res.status, body: err.slice(0, 100) });
    throw new Error("Failed to send WhatsApp file");
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Green API returned unexpected content-type: ${contentType.split(";")[0]}`);
  }

  return await res.json();
}

function formatGreenApiPhone(phone: string): string {
  let chatId = phone.trim();
  if (chatId.endsWith("@g.us")) {
    return chatId;
  }

  // Remove all non-digit characters
  chatId = chatId.replace(/\D/g, "");

  // If israel number starting with 0, replace with 972
  if (chatId.startsWith("0")) {
    chatId = "972" + chatId.substring(1);
  }

  // Ensure @c.us suffix
  if (!chatId.endsWith("@c.us")) {
    chatId = chatId + "@c.us";
  }

  return chatId;
}
