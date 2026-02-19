import { z } from "zod";

// Max message body length (WhatsApp Cloud API limit is 4096)
const MAX_MESSAGE_LENGTH = 4096;

export const sendMessageSchema = z.object({
  conversationId: z.number().int().positive(),
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  type: z.enum(["text", "image", "video", "audio", "document"]).default("text"),
  mediaUrl: z.string().url().optional(),
  mediaFileName: z.string().max(255).optional(),
});

export const getConversationsSchema = z.object({
  cursor: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).default(30),
  assignedToMe: z.boolean().optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  search: z.string().max(100).optional(),
});

export const getMessagesSchema = z.object({
  conversationId: z.number().int().positive(),
  cursor: z.bigint().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const assignConversationSchema = z.object({
  conversationId: z.number().int().positive(),
  userId: z.number().int().positive().nullable(),
});

export const conversationIdSchema = z.object({
  conversationId: z.number().int().positive(),
});

export const searchContactsSchema = z.object({
  query: z.string().min(1).max(100),
});

export const embeddedSignupSchema = z.object({
  code: z.string().min(1),
});
