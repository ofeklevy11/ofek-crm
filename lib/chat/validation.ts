import { z } from "zod";

const positiveInt = z.number().int().positive();

export const sendMessageSchema = z.object({
  receiverId: positiveInt,
  content: z.string().max(5000).transform(s => s.trim()).pipe(z.string().min(1)),
});

export const sendGroupMessageSchema = z.object({
  groupId: positiveInt,
  content: z.string().max(5000).transform(s => s.trim()).pipe(z.string().min(1)),
});

export const getMessagesSchema = z.object({
  otherUserId: positiveInt,
});

export const getGroupMessagesSchema = z.object({
  groupId: positiveInt,
});

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  imageUrl: z.string().max(2048).default(""),
  memberIds: z.array(positiveInt).min(1).max(200),
});

export const updateGroupSchema = z.object({
  groupId: positiveInt,
  name: z.string().min(1).max(100),
  imageUrl: z.string().max(2048).default(""),
  memberIds: z.array(positiveInt).min(1).max(200),
});

export const markAsReadSchema = z.object({
  id: positiveInt,
  type: z.enum(["user", "group"]).default("user"),
});

/** Only allow http: and https: protocols — rejects javascript:, data:, etc. */
export function sanitizeImageUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
    return "";
  } catch {
    return "";
  }
}
