/**
 * Integration tests for WhatsApp Cloud API Inngest jobs.
 *
 * REAL: Prisma (test DB), company/user/account/phoneNumber seeding,
 *       @/lib/whatsapp/types (mapMessageType, mapMessageStatus, STATUS_PRIORITY).
 * MOCKED: @/lib/inngest/client (handler capture), @/lib/redis,
 *         @/lib/env, @/lib/services/encryption, @/lib/services/whatsapp-cloud-api.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Capture handlers ───────────────────────────────────────────────
const handlers: Record<string, (...args: any[]) => any> = {};
const mockSend = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (...args: any[]) => mockSend(...args),
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { fn: handler };
    }),
  },
}));

// ── Mock Redis ───────────────────────────────────────────────────
vi.mock("@/lib/redis", () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(1),
  },
}));

// ── Mock env ─────────────────────────────────────────────────────
vi.mock("@/lib/env", () => ({
  env: { WHATSAPP_ACCESS_TOKEN: "test-token" },
}));

// ── Mock encryption ──────────────────────────────────────────────
vi.mock("@/lib/services/encryption", () => ({
  decrypt: vi.fn().mockReturnValue("decrypted-token"),
}));

// ── Mock WhatsApp Cloud API ──────────────────────────────────────
const mockSendTextMessage = vi.fn().mockResolvedValue({ messageId: "wamid.test123" });
const mockSendMediaMessage = vi.fn().mockResolvedValue({ messageId: "wamid.test123" });
const mockSendTemplateMessage = vi.fn().mockResolvedValue({ messageId: "wamid.test123" });
const mockGetMediaUrl = vi.fn().mockResolvedValue({
  url: "https://example.com/media",
  mime_type: "image/jpeg",
});
const mockDownloadMedia = vi.fn().mockResolvedValue(Buffer.from("fake"));
vi.mock("@/lib/services/whatsapp-cloud-api", () => ({
  sendTextMessage: (...args: any[]) => mockSendTextMessage(...args),
  sendMediaMessage: (...args: any[]) => mockSendMediaMessage(...args),
  sendTemplateMessage: (...args: any[]) => mockSendTemplateMessage(...args),
  getMediaUrl: (...args: any[]) => mockGetMediaUrl(...args),
  downloadMedia: (...args: any[]) => mockDownloadMedia(...args),
}));

// ── State ────────────────────────────────────────────────────────
let companyId: number;
let userId: number;
let waAccountId: number;
let waPhoneNumberDbId: number;
const waPhoneNumberId = `test-phone-${Date.now()}`;

beforeAll(async () => {
  // Import the function file so handlers are captured
  await import("@/lib/inngest/functions/whatsapp-cloud-jobs");

  const company = await prisma.company.create({
    data: {
      name: "WA Cloud Test Co",
      slug: `wacloud-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: "WA Admin",
      email: `wa-admin-${Date.now()}@test.com`,
      passwordHash: "h",
      role: "admin",
    },
  });
  userId = user.id;

  // Create WhatsApp account
  const account = await prisma.whatsAppAccount.create({
    data: {
      companyId,
      wabaId: `waba-${Date.now()}`,
      accessTokenEnc: "enc-token",
      accessTokenIv: "iv",
      accessTokenTag: "tag",
      webhookVerifyToken: "verify-token",
      status: "ACTIVE",
      connectedBy: userId,
    },
  });
  waAccountId = account.id;

  // Create WhatsApp phone number
  const phone = await prisma.whatsAppPhoneNumber.create({
    data: {
      companyId,
      accountId: waAccountId,
      phoneNumberId: waPhoneNumberId,
      displayPhone: "+1234567890",
      verifiedName: "Test Business",
      isActive: true,
    },
  });
  waPhoneNumberDbId = phone.id;
}, 15000);

afterAll(async () => {
  await prisma.waMessage.deleteMany({ where: { companyId } });
  await prisma.waConversation.deleteMany({ where: { companyId } });
  await prisma.waContact.deleteMany({ where: { companyId } });
  await prisma.whatsAppPhoneNumber.deleteMany({ where: { companyId } });
  await prisma.whatsAppAccount.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}, 15000);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests: processWaIncomingMessage ─────────────────────────────

describe("processWaIncomingMessage", () => {
  it(
    "upserts contact, conversation, and stores inbound message",
    async () => {
      const step = createMockStep();
      const contactWaId = `972501111${Date.now()}`;
      const wamId = `wamid.incoming1-${Date.now()}`;

      const event = createMockEvent("whatsapp/incoming-message", {
        companyId,
        phoneNumberDbId: waPhoneNumberDbId,
        accountId: waAccountId,
        phoneNumberId: waPhoneNumberId,
        contactProfile: "Test Customer",
        contactWaId,
        message: {
          from: contactWaId,
          id: wamId,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "text",
          text: { body: "Hello" },
        },
      });

      const result = await handlers["process-wa-incoming-message"]({ event, step });

      expect(result.success).toBe(true);

      // Verify WaContact created
      const contact = await prisma.waContact.findUnique({
        where: { companyId_waId: { companyId, waId: contactWaId } },
      });
      expect(contact).not.toBeNull();
      expect(contact!.profileName).toBe("Test Customer");

      // Verify WaConversation created
      const conversation = await prisma.waConversation.findFirst({
        where: { companyId, contactId: contact!.id, phoneNumberId: waPhoneNumberDbId },
      });
      expect(conversation).not.toBeNull();
      expect(conversation!.status).toBe("OPEN");

      // Verify WaMessage created with direction INBOUND
      const message = await prisma.waMessage.findUnique({ where: { wamId } });
      expect(message).not.toBeNull();
      expect(message!.direction).toBe("INBOUND");
      expect(message!.body).toBe("Hello");
      expect(message!.type).toBe("TEXT");
      expect(message!.status).toBe("DELIVERED");
    },
    15000,
  );

  it(
    "skips duplicate messages (idempotent)",
    async () => {
      const step = createMockStep();
      const contactWaId = `972502222${Date.now()}`;
      const wamId = `wamid.dup-${Date.now()}`;

      const eventData = {
        companyId,
        phoneNumberDbId: waPhoneNumberDbId,
        accountId: waAccountId,
        phoneNumberId: waPhoneNumberId,
        contactProfile: "Dup Customer",
        contactWaId,
        message: {
          from: contactWaId,
          id: wamId,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "text",
          text: { body: "Duplicate test" },
        },
      };

      // First call - should create the message
      const event1 = createMockEvent("whatsapp/incoming-message", eventData);
      const result1 = await handlers["process-wa-incoming-message"]({ event: event1, step });
      expect(result1.success).toBe(true);

      // Second call with same message.id - should detect duplicate
      const event2 = createMockEvent("whatsapp/incoming-message", eventData);
      const result2 = await handlers["process-wa-incoming-message"]({ event: event2, step });
      expect(result2.success).toBe(true);
      expect(result2.duplicate).toBe(true);

      // Only one WaMessage in DB for this wamId
      const count = await prisma.waMessage.count({ where: { wamId } });
      expect(count).toBe(1);
    },
    15000,
  );

  it(
    "triggers media download for image messages",
    async () => {
      const step = createMockStep();
      const contactWaId = `972503333${Date.now()}`;
      const wamId = `wamid.image-${Date.now()}`;

      const event = createMockEvent("whatsapp/incoming-message", {
        companyId,
        phoneNumberDbId: waPhoneNumberDbId,
        accountId: waAccountId,
        phoneNumberId: waPhoneNumberId,
        contactProfile: "Image Customer",
        contactWaId,
        message: {
          from: contactWaId,
          id: wamId,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "image",
          image: { id: "media123", mime_type: "image/jpeg", sha256: "abc" },
        },
      });

      await handlers["process-wa-incoming-message"]({ event, step });

      // Verify mockSend was called with "whatsapp/download-media"
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "whatsapp/download-media",
          data: expect.objectContaining({
            companyId,
            accountId: waAccountId,
            mediaId: "media123",
          }),
        }),
      );
    },
    15000,
  );
});

// ─── Tests: processWaStatusUpdate ────────────────────────────────

describe("processWaStatusUpdate", () => {
  it(
    "upgrades message status from SENT to DELIVERED",
    async () => {
      const step = createMockStep();
      const contactWaId = `972504444${Date.now()}`;
      const wamId = `wamid.status-upgrade-${Date.now()}`;

      // Create prerequisite data
      const contact = await prisma.waContact.create({
        data: { companyId, waId: contactWaId, profileName: "Status Test", phone: contactWaId },
      });
      const conversation = await prisma.waConversation.create({
        data: {
          companyId,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          status: "OPEN",
        },
      });
      await prisma.waMessage.create({
        data: {
          companyId,
          conversationId: conversation.id,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          wamId,
          direction: "OUTBOUND",
          type: "TEXT",
          status: "SENT",
          body: "Outbound msg",
          timestamp: new Date(),
        },
      });

      const event = createMockEvent("whatsapp/status-update", {
        companyId,
        phoneNumberDbId: waPhoneNumberDbId,
        wamId,
        status: "delivered",
        timestamp: String(Math.floor(Date.now() / 1000)),
        recipientId: contactWaId,
        errors: null,
      });

      const result = await handlers["process-wa-status-update"]({ event, step });
      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);

      // Verify status upgraded in DB
      const msg = await prisma.waMessage.findUnique({ where: { wamId } });
      expect(msg!.status).toBe("DELIVERED");
    },
    15000,
  );

  it(
    "does not downgrade status (READ -> DELIVERED)",
    async () => {
      const step = createMockStep();
      const contactWaId = `972505555${Date.now()}`;
      const wamId = `wamid.status-nodown-${Date.now()}`;

      // Create prerequisite data with status READ
      const contact = await prisma.waContact.create({
        data: { companyId, waId: contactWaId, profileName: "NoDown Test", phone: contactWaId },
      });
      const conversation = await prisma.waConversation.create({
        data: {
          companyId,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          status: "OPEN",
        },
      });
      await prisma.waMessage.create({
        data: {
          companyId,
          conversationId: conversation.id,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          wamId,
          direction: "OUTBOUND",
          type: "TEXT",
          status: "READ",
          body: "Already read",
          timestamp: new Date(),
        },
      });

      const event = createMockEvent("whatsapp/status-update", {
        companyId,
        phoneNumberDbId: waPhoneNumberDbId,
        wamId,
        status: "delivered",
        timestamp: String(Math.floor(Date.now() / 1000)),
        recipientId: contactWaId,
        errors: null,
      });

      const result = await handlers["process-wa-status-update"]({ event, step });
      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);

      // Verify status remains READ
      const msg = await prisma.waMessage.findUnique({ where: { wamId } });
      expect(msg!.status).toBe("READ");
    },
    15000,
  );

  it(
    "rejects cross-tenant status update",
    async () => {
      const step = createMockStep();
      const contactWaId = `972506666${Date.now()}`;
      const wamId = `wamid.status-tenant-${Date.now()}`;

      // Create message belonging to our test company
      const contact = await prisma.waContact.create({
        data: { companyId, waId: contactWaId, profileName: "Tenant Test", phone: contactWaId },
      });
      const conversation = await prisma.waConversation.create({
        data: {
          companyId,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          status: "OPEN",
        },
      });
      await prisma.waMessage.create({
        data: {
          companyId,
          conversationId: conversation.id,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          wamId,
          direction: "OUTBOUND",
          type: "TEXT",
          status: "SENT",
          body: "Tenant check",
          timestamp: new Date(),
        },
      });

      // Call handler with a DIFFERENT companyId
      const event = createMockEvent("whatsapp/status-update", {
        companyId: 999999,
        phoneNumberDbId: waPhoneNumberDbId,
        wamId,
        status: "delivered",
        timestamp: String(Math.floor(Date.now() / 1000)),
        recipientId: contactWaId,
        errors: null,
      });

      const result = await handlers["process-wa-status-update"]({ event, step });
      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);

      // Verify message status unchanged (still SENT)
      const msg = await prisma.waMessage.findUnique({ where: { wamId } });
      expect(msg!.status).toBe("SENT");
    },
    15000,
  );
});

// ─── Tests: sendWaOutboundMessage ────────────────────────────────

describe("sendWaOutboundMessage", () => {
  it(
    "sends text message and stores in DB",
    async () => {
      const step = createMockStep();
      const contactWaId = `972507777${Date.now()}`;

      // Create contact and conversation with lastInboundAt within 24 hours
      const contact = await prisma.waContact.create({
        data: { companyId, waId: contactWaId, profileName: "Outbound Test", phone: contactWaId },
      });
      const conversation = await prisma.waConversation.create({
        data: {
          companyId,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          status: "OPEN",
          lastInboundAt: new Date(), // Now = within 24h window
        },
      });

      const event = createMockEvent("whatsapp/send-message", {
        companyId,
        conversationId: conversation.id,
        body: "Test message",
        type: "text",
        sentByUserId: userId,
      });

      const result = await handlers["send-wa-outbound-message"]({ event, step });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();

      // Verify sendTextMessage mock was called
      expect(mockSendTextMessage).toHaveBeenCalledWith(
        waPhoneNumberId,
        expect.any(String),
        contactWaId,
        "Test message",
      );

      // Verify WaMessage created with direction OUTBOUND
      const msg = await prisma.waMessage.findUnique({
        where: { wamId: "wamid.test123" },
      });
      expect(msg).not.toBeNull();
      expect(msg!.direction).toBe("OUTBOUND");
      expect(msg!.status).toBe("SENT");
      expect(msg!.body).toBe("Test message");
    },
    15000,
  );

  it(
    "throws when 24-hour window expired",
    async () => {
      const step = createMockStep();
      const contactWaId = `972508888${Date.now()}`;

      // Create contact and conversation with lastInboundAt 25 hours ago
      const contact = await prisma.waContact.create({
        data: { companyId, waId: contactWaId, profileName: "Expired Test", phone: contactWaId },
      });
      const conversation = await prisma.waConversation.create({
        data: {
          companyId,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          status: "OPEN",
          lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        },
      });

      const event = createMockEvent("whatsapp/send-message", {
        companyId,
        conversationId: conversation.id,
        body: "Should fail",
        type: "text",
        sentByUserId: userId,
      });

      await expect(
        handlers["send-wa-outbound-message"]({ event, step }),
      ).rejects.toThrow("24-hour messaging window expired");
    },
    15000,
  );
});

// ─── Tests: downloadWaMedia ──────────────────────────────────────

describe("downloadWaMedia", () => {
  it(
    "downloads media and updates message",
    async () => {
      const step = createMockStep();
      const contactWaId = `972509999${Date.now()}`;
      const wamId = `wamid.media-dl-${Date.now()}`;

      // Create prerequisite data with a mediaId on the message
      const contact = await prisma.waContact.create({
        data: { companyId, waId: contactWaId, profileName: "Media Test", phone: contactWaId },
      });
      const conversation = await prisma.waConversation.create({
        data: {
          companyId,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          status: "OPEN",
        },
      });
      const msg = await prisma.waMessage.create({
        data: {
          companyId,
          conversationId: conversation.id,
          phoneNumberId: waPhoneNumberDbId,
          contactId: contact.id,
          wamId,
          direction: "INBOUND",
          type: "IMAGE",
          status: "DELIVERED",
          mediaId: "media-dl-123",
          timestamp: new Date(),
        },
      });

      const event = createMockEvent("whatsapp/download-media", {
        companyId,
        accountId: waAccountId,
        messageId: msg.id.toString(),
        mediaId: "media-dl-123",
      });

      const result = await handlers["download-wa-media"]({ event, step });
      expect(result.success).toBe(true);

      // Verify getMediaUrl and downloadMedia were called
      expect(mockGetMediaUrl).toHaveBeenCalledWith("media-dl-123", expect.any(String));
      expect(mockDownloadMedia).toHaveBeenCalledWith(
        "https://example.com/media",
        expect.any(String),
      );

      // Verify message.mediaUrl was updated in DB
      const updated = await prisma.waMessage.findUnique({ where: { wamId } });
      expect(updated!.mediaUrl).toBe("https://example.com/media");
      expect(updated!.mediaMime).toBe("image/jpeg");
    },
    15000,
  );
});
