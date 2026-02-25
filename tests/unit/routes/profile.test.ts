import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// --- Mocks ---
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
  invalidateUserCache: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasUserFlag: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    company: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    whatsAppAccount: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    whatsAppPhoneNumber: {
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api-key-utils", () => ({
  hashApiKey: vi.fn(),
  maskApiKey: vi.fn(),
}));

vi.mock("@/lib/security/audit-security", () => ({
  logSecurityEvent: vi.fn(),
  SEC_API_KEY_CREATED: "SEC_API_KEY_CREATED",
  SEC_API_KEY_DELETED: "SEC_API_KEY_DELETED",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    whatsappMutate: { prefix: "wa-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

// --- Imports ---
import { getApiKeys, createApiKey, deleteApiKey } from "@/app/actions/api-keys";
import {
  saveGreenApiCredentials,
  getGreenApiCredentials,
  getGreenApiStatus,
  disconnectGreenApi,
} from "@/app/actions/green-api";
import { updateCompanyName } from "@/app/actions/update-company-name";
import {
  getWhatsAppAccounts,
  disconnectWhatsAppAccount,
  getWhatsAppConnectionStatus,
} from "@/app/actions/whatsapp-admin";

import { getCurrentUser, invalidateUserCache } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { hashApiKey, maskApiKey } from "@/lib/api-key-utils";
import {
  logSecurityEvent,
  SEC_API_KEY_CREATED,
  SEC_API_KEY_DELETED,
} from "@/lib/security/audit-security";
import { checkActionRateLimit } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

// --- Fixtures ---
const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const basicUser = {
  id: 2,
  companyId: 100,
  name: "Basic",
  email: "basic@test.com",
  role: "basic" as const,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const superUser = {
  id: 4,
  companyId: 100,
  name: "Super",
  email: "super@test.com",
  role: "super" as any,
  allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

// --- Global setup ---
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn();
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(hasUserFlag).mockReturnValue(false);
  vi.mocked(hashApiKey).mockReturnValue("hashed_key");
  vi.mocked(maskApiKey).mockReturnValue("sk_live_...abc123");
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. API Keys
// ═══════════════════════════════════════════════════════════════════════════

// ─── getApiKeys ──────────────────────────────────────────────────────────
describe("getApiKeys", () => {
  it("returns error when user is not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getApiKeys();
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns error when user is not admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    const res = await getApiKeys();
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("rejects super role (admin-only, not admin+super)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superUser as any);
    const res = await getApiKeys();
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns API keys for admin user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const keys = [{ id: 1, name: "test-key", key: "sk_live_...abc123" }];
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue(keys as any);

    const res = await getApiKeys();
    expect(res).toEqual({ success: true, data: keys });
  });

  it("scopes query to user companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

    await getApiKeys();
    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 100 } }),
    );
  });

  it("orders by createdAt desc and limits to 100", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

    await getApiKeys();
    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  });

  it("selects correct fields including creator name", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

    await getApiKeys();
    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          key: true,
          isActive: true,
          createdAt: true,
          creator: { select: { name: true } },
        },
      }),
    );
  });

  it("returns empty array when no keys exist", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

    const res = await getApiKeys();
    expect(res).toEqual({ success: true, data: [] });
  });

  it("returns error on database failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findMany).mockRejectedValue(new Error("DB"));

    const res = await getApiKeys();
    expect(res).toEqual({ success: false, error: "Failed to fetch API keys" });
  });
});

// ─── createApiKey ────────────────────────────────────────────────────────
describe("createApiKey", () => {
  it("returns error when user is not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await createApiKey("my-key");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns error when user is not admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    const res = await createApiKey("my-key");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("rejects super role (admin-only, not admin+super)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superUser as any);
    const res = await createApiKey("my-key");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("generates key with sk_live_ prefix", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const created = { id: 1, name: "k", key: "sk_live_...abc123", isActive: true, createdAt: new Date() };
    vi.mocked(prisma.apiKey.create).mockResolvedValue(created as any);

    const res = await createApiKey("k");
    expect(res.success).toBe(true);
    expect((res as any).data.fullKey).toMatch(/^sk_live_/);
  });

  it("stores hashed and masked key in database", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({ id: 1 } as any);

    await createApiKey("k");
    expect(hashApiKey).toHaveBeenCalled();
    expect(maskApiKey).toHaveBeenCalled();
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: "sk_live_...abc123",
          keyHash: "hashed_key",
        }),
      }),
    );
  });

  it("stores key name and creator info with companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({ id: 1 } as any);

    await createApiKey("production-key");
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "production-key",
          createdBy: 1,
          companyId: 100,
        }),
      }),
    );
  });

  it("returns full key in response (only time exposed)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const created = { id: 1, name: "k", key: "sk_live_...abc123", isActive: true, createdAt: new Date() };
    vi.mocked(prisma.apiKey.create).mockResolvedValue(created as any);

    const res = await createApiKey("k");
    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data.fullKey).toBeDefined();
    expect(data.fullKey).toMatch(/^sk_live_[a-f0-9]+$/);
  });

  it("logs security event SEC_API_KEY_CREATED", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({ id: 5, name: "k" } as any);

    await createApiKey("k");
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: SEC_API_KEY_CREATED,
        companyId: 100,
        userId: 1,
        details: expect.objectContaining({ keyName: "k", keyId: 5 }),
      }),
    );
  });

  it("returns error on database failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.create).mockRejectedValue(new Error("DB"));

    const res = await createApiKey("k");
    expect(res).toEqual({ success: false, error: "Failed to create API key" });
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("passes empty name to DB unvalidated (no server-side validation)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({ id: 1 } as any);

    await createApiKey("");
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "" }),
      }),
    );
  });
});

// ─── deleteApiKey ────────────────────────────────────────────────────────
describe("deleteApiKey", () => {
  it("returns error when user is not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await deleteApiKey(1);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns error when user is not admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    const res = await deleteApiKey(1);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("rejects super role (admin-only, not admin+super)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superUser as any);
    const res = await deleteApiKey(1);
    expect(res).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns Key not found when findFirst returns null (covers missing key and cross-company isolation)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null);

    const res = await deleteApiKey(1);
    expect(res).toEqual({ success: false, error: "Key not found" });
    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
    });
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("deletes key scoped to companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: 1, name: "k" } as any);
    vi.mocked(prisma.apiKey.delete).mockResolvedValue({} as any);

    await deleteApiKey(1);
    expect(prisma.apiKey.delete).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
    });
  });

  it("logs security event SEC_API_KEY_DELETED with keyName", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: 1, name: "prod-key" } as any);
    vi.mocked(prisma.apiKey.delete).mockResolvedValue({} as any);

    await deleteApiKey(1);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: SEC_API_KEY_DELETED,
        companyId: 100,
        userId: 1,
        details: expect.objectContaining({ keyId: 1, keyName: "prod-key" }),
      }),
    );
  });

  it("returns success on successful deletion", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: 1, name: "k" } as any);
    vi.mocked(prisma.apiKey.delete).mockResolvedValue({} as any);

    const res = await deleteApiKey(1);
    expect(res).toEqual({ success: true });
  });

  it("returns error on database failure during findFirst", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findFirst).mockRejectedValue(new Error("DB"));

    const res = await deleteApiKey(1);
    expect(res).toEqual({ success: false, error: "Failed to delete API key" });
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("returns error on database failure during delete", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: 1, name: "k" } as any);
    vi.mocked(prisma.apiKey.delete).mockRejectedValue(new Error("DB"));

    const res = await deleteApiKey(1);
    expect(res).toEqual({ success: false, error: "Failed to delete API key" });
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Green API
// ═══════════════════════════════════════════════════════════════════════════

// ─── saveGreenApiCredentials ─────────────────────────────────────────────
describe("saveGreenApiCredentials", () => {
  it("throws Unauthorized when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(saveGreenApiCredentials("inst", "tok")).rejects.toThrow("Unauthorized");
  });

  it("throws permission error for basic role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    await expect(saveGreenApiCredentials("inst", "tok")).rejects.toThrow(
      "Only admins can manage Green API connections",
    );
  });

  it("throws error when instanceId is empty", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(saveGreenApiCredentials("", "tok")).rejects.toThrow("Missing credentials");
  });

  it("throws error when token is empty", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    await expect(saveGreenApiCredentials("inst", "")).rejects.toThrow("Missing credentials");
  });

  it("verifies credentials by calling Green API endpoint", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stateInstance: "authorized" }),
    } as Response);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);

    await saveGreenApiCredentials("12345", "mytoken");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.green-api.com/waInstance12345/getStateInstance/mytoken",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("throws when Green API returns non-ok response", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false } as Response);

    await expect(saveGreenApiCredentials("inst", "tok")).rejects.toThrow(
      "Could not verify Green API credentials",
    );
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it("throws when Green API returns invalid data (no stateInstance)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ someOther: "field" }),
    } as Response);

    await expect(saveGreenApiCredentials("inst", "tok")).rejects.toThrow(
      "Could not verify Green API credentials",
    );
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it("throws when fetch fails (network error)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network error"));

    await expect(saveGreenApiCredentials("inst", "tok")).rejects.toThrow(
      "Could not verify Green API credentials",
    );
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it("saves credentials to company on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stateInstance: "authorized" }),
    } as Response);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);

    await saveGreenApiCredentials("inst123", "tok456");
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: {
        greenApiInstanceId: "inst123",
        greenApiToken: "tok456",
      },
    });
  });

  it("returns success object", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stateInstance: "authorized" }),
    } as Response);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);

    const res = await saveGreenApiCredentials("inst", "tok");
    expect(res).toEqual({ success: true });
  });

  it("allows super role to save credentials", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superUser as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stateInstance: "authorized" }),
    } as Response);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);

    const res = await saveGreenApiCredentials("inst", "tok");
    expect(res).toEqual({ success: true });
  });

  it("propagates raw DB error when company.update fails after verification (no try/catch)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stateInstance: "authorized" }),
    } as Response);
    vi.mocked(prisma.company.update).mockRejectedValue(new Error("DB write failed"));

    await expect(saveGreenApiCredentials("inst", "tok")).rejects.toThrow("DB write failed");
  });
});

// ─── getGreenApiCredentials ──────────────────────────────────────────────
describe("getGreenApiCredentials", () => {
  it("throws Unauthorized when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getGreenApiCredentials()).rejects.toThrow("Unauthorized");
  });

  it("returns masked data for basic user when credentials exist", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst123",
    } as any);

    const res = await getGreenApiCredentials();
    expect(res).toEqual({
      greenApiInstanceId: "********",
      greenApiToken: null,
      isAdmin: false,
    });
  });

  it("returns nulls for basic user when no credentials", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: null,
    } as any);

    const res = await getGreenApiCredentials();
    expect(res).toEqual({
      greenApiInstanceId: null,
      greenApiToken: null,
      isAdmin: false,
    });
  });

  it("returns actual instanceId and partial token for admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst123",
      greenApiToken: "abcdefghij1234",
    } as any);

    const res = await getGreenApiCredentials();
    expect(res).toEqual({
      greenApiInstanceId: "inst123",
      greenApiToken: "****1234",
      isAdmin: true,
    });
  });

  it("returns nulls for admin when no credentials set", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: null,
      greenApiToken: null,
    } as any);

    const res = await getGreenApiCredentials();
    expect(res).toEqual({
      greenApiInstanceId: null,
      greenApiToken: null,
      isAdmin: true,
    });
  });

  it("scopes query to user companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: null,
      greenApiToken: null,
    } as any);

    await getGreenApiCredentials();
    expect(prisma.company.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100 } }),
    );
  });

  it("scopes non-admin query to user companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: null,
    } as any);

    await getGreenApiCredentials();
    expect(prisma.company.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100 } }),
    );
  });

  it("returns actual credentials for super role user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst123",
      greenApiToken: "abcdefghij1234",
    } as any);

    const res = await getGreenApiCredentials();
    expect(res).toEqual({
      greenApiInstanceId: "inst123",
      greenApiToken: "****1234",
      isAdmin: true,
    });
  });

  it("throws when findUnique fails (no try/catch)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockRejectedValue(new Error("DB down"));

    await expect(getGreenApiCredentials()).rejects.toThrow("DB down");
  });

  it("leaks full token when token is very short (slice(-4) edge case)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst123",
      greenApiToken: "ab",
    } as any);

    const res = await getGreenApiCredentials();
    // slice(-4) on "ab" returns "ab" — mask is "****ab", exposing the full token
    expect(res.greenApiToken).toBe("****ab");
  });

  it("returns nulls when findUnique returns null entirely (company not in DB)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue(null);

    const res = await getGreenApiCredentials();
    expect(res).toEqual({
      greenApiInstanceId: null,
      greenApiToken: null,
      isAdmin: true,
    });
  });

  it("non-admin query selects only greenApiInstanceId (no token)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst123",
    } as any);

    await getGreenApiCredentials();
    expect(prisma.company.findUnique).toHaveBeenCalledWith({
      where: { id: 100 },
      select: { greenApiInstanceId: true },
    });
  });
});

// ─── getGreenApiStatus ───────────────────────────────────────────────────
describe("getGreenApiStatus", () => {
  it("throws Unauthorized when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getGreenApiStatus()).rejects.toThrow("Unauthorized");
  });

  it("returns null when no credentials configured", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: null,
      greenApiToken: null,
    } as any);

    const res = await getGreenApiStatus();
    expect(res).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns null when only instanceId is set (token is null)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst123",
      greenApiToken: null,
    } as any);

    const res = await getGreenApiStatus();
    expect(res).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns null when only token is set (instanceId is null)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: null,
      greenApiToken: "tok123",
    } as any);

    const res = await getGreenApiStatus();
    expect(res).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("calls Green API with correct URL, cache, and abort signal", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst1",
      greenApiToken: "tok1",
    } as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stateInstance: "authorized" }),
    } as Response);

    await getGreenApiStatus();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.green-api.com/waInstanceinst1/getStateInstance/tok1",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("returns connected status with state on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst1",
      greenApiToken: "tok1",
    } as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stateInstance: "authorized" }),
    } as Response);

    const res = await getGreenApiStatus();
    expect(res).toEqual({ connected: true, state: "authorized" });
  });

  it("returns error when Green API returns non-ok", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst1",
      greenApiToken: "tok1",
    } as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false } as Response);

    const res = await getGreenApiStatus();
    expect(res).toEqual({ error: "Failed to fetch status" });
  });

  it("returns connection error when fetch throws", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst1",
      greenApiToken: "tok1",
    } as any);
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network down"));

    const res = await getGreenApiStatus();
    expect(res).toEqual({ error: "Connection error" });
  });

  it("basic user can check status (no permission gate)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      greenApiInstanceId: "inst1",
      greenApiToken: "tok1",
    } as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stateInstance: "authorized" }),
    } as Response);

    const res = await getGreenApiStatus();
    expect(res).toEqual({ connected: true, state: "authorized" });
  });

  it("throws when findUnique fails before fetch (outside try/catch)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.findUnique).mockRejectedValue(new Error("DB down"));

    await expect(getGreenApiStatus()).rejects.toThrow("DB down");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

// ─── disconnectGreenApi ──────────────────────────────────────────────────
describe("disconnectGreenApi", () => {
  it("throws Unauthorized when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(disconnectGreenApi()).rejects.toThrow("Unauthorized");
  });

  it("throws permission error for basic role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    await expect(disconnectGreenApi()).rejects.toThrow(
      "Only admins can manage Green API connections",
    );
  });

  it("sets credentials to null in database", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);

    await disconnectGreenApi();
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: {
        greenApiInstanceId: null,
        greenApiToken: null,
      },
    });
  });

  it("returns success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);

    const res = await disconnectGreenApi();
    expect(res).toEqual({ success: true });
  });

  it("allows super role to disconnect", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superUser as any);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);

    const res = await disconnectGreenApi();
    expect(res).toEqual({ success: true });
  });

  it("throws when company.update fails (no try/catch)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.company.update).mockRejectedValue(new Error("DB failure"));

    await expect(disconnectGreenApi()).rejects.toThrow("DB failure");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Update Company Name
// ═══════════════════════════════════════════════════════════════════════════

describe("updateCompanyName", () => {
  it('returns error when not authenticated ("לא מאומת")', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await updateCompanyName({ newCompanyName: "New", password: "pass" });
    expect(res).toEqual({ success: false, error: "לא מאומת" });
  });

  it('returns error when not admin ("רק מנהלים יכולים לשנות את שם הארגון")', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    const res = await updateCompanyName({ newCompanyName: "New", password: "pass" });
    expect(res).toEqual({ success: false, error: "רק מנהלים יכולים לשנות את שם הארגון" });
  });

  it("rejects super role (admin-only, not admin+super)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superUser as any);
    const res = await updateCompanyName({ newCompanyName: "New", password: "pass" });
    expect(res).toEqual({ success: false, error: "רק מנהלים יכולים לשנות את שם הארגון" });
  });

  it("returns error when newCompanyName is empty", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateCompanyName({ newCompanyName: "", password: "pass" });
    expect(res).toEqual({ success: false, error: "שם הארגון לא יכול להיות רק" });
  });

  it("returns error when newCompanyName is only whitespace", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateCompanyName({ newCompanyName: "   ", password: "pass" });
    expect(res).toEqual({ success: false, error: "שם הארגון לא יכול להיות רק" });
  });

  it("returns error when password is empty", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    const res = await updateCompanyName({ newCompanyName: "New", password: "" });
    expect(res).toEqual({ success: false, error: "נא להזין סיסמה" });
  });

  it('returns error when user not found in DB ("משתמש לא נמצא")', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await updateCompanyName({ newCompanyName: "New", password: "pass" });
    expect(res).toEqual({ success: false, error: "משתמש לא נמצא" });
  });

  it('returns error when password is incorrect ("סיסמה שגויה")', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: "hashed",
      companyId: 100,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const res = await updateCompanyName({ newCompanyName: "New", password: "wrong" });
    expect(res).toEqual({ success: false, error: "סיסמה שגויה" });
  });

  it("invalidates user cache after success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: "hashed",
      companyId: 100,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);
    vi.mocked(invalidateUserCache).mockResolvedValue(undefined);

    await updateCompanyName({ newCompanyName: "New", password: "pass" });
    expect(invalidateUserCache).toHaveBeenCalledWith(1);
  });

  it('returns success message ("שם הארגון עודכן בהצלחה")', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: "hashed",
      companyId: 100,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);
    vi.mocked(invalidateUserCache).mockResolvedValue(undefined);

    const res = await updateCompanyName({ newCompanyName: "New", password: "pass" });
    expect(res).toEqual({ success: true, message: "שם הארגון עודכן בהצלחה" });
  });

  it("trims whitespace from company name", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: "hashed",
      companyId: 100,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);
    vi.mocked(invalidateUserCache).mockResolvedValue(undefined);

    await updateCompanyName({ newCompanyName: "\t Trimmed \n", password: "pass" });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { name: "Trimmed" },
    });
  });

  it("scopes company update to DB-sourced companyId (not session companyId)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any); // companyId: 100
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: "hashed",
      companyId: 200, // different from adminUser.companyId
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);
    vi.mocked(invalidateUserCache).mockResolvedValue(undefined);

    await updateCompanyName({ newCompanyName: "New", password: "pass" });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 200 },
      data: { name: "New" },
    });
  });

  it("verifies password against correct hash", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: "the_hash",
      companyId: 100,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.company.update).mockResolvedValue({} as any);
    vi.mocked(invalidateUserCache).mockResolvedValue(undefined);

    await updateCompanyName({ newCompanyName: "New", password: "mypass" });
    expect(bcrypt.compare).toHaveBeenCalledWith("mypass", "the_hash");
  });

  it("returns error on database failure", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("DB"));

    const res = await updateCompanyName({ newCompanyName: "New", password: "pass" });
    expect(res).toEqual({ success: false, error: "שגיאה בעדכון שם הארגון" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. WhatsApp Admin
// ═══════════════════════════════════════════════════════════════════════════

// ─── getWhatsAppAccounts ─────────────────────────────────────────────────
describe("getWhatsAppAccounts", () => {
  it("throws Unauthorized when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getWhatsAppAccounts()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking canManageWhatsApp flag", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(false);

    await expect(getWhatsAppAccounts()).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);

    await expect(getWhatsAppAccounts()).rejects.toThrow("Rate limit exceeded");
  });

  it("proceeds when checkActionRateLimit throws (fail-open)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    vi.mocked(prisma.whatsAppAccount.findMany).mockResolvedValue([]);

    const res = await getWhatsAppAccounts();
    expect(res).toEqual([]);
  });

  it("returns accounts for authorized user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findMany).mockResolvedValue([
      {
        id: 1,
        wabaId: "waba1",
        businessName: "Biz",
        status: "ACTIVE",
        accessToken: "secret",
        connectedUser: { id: 1, name: "Admin" },
        phoneNumbers: [{ id: 1, phoneNumberId: "p1", displayPhone: "+1234", verifiedName: "V", qualityRating: "GREEN" }],
        createdAt: new Date("2024-01-01"),
      },
    ] as any);

    const res = await getWhatsAppAccounts();
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({
      id: 1,
      wabaId: "waba1",
      businessName: "Biz",
      status: "ACTIVE",
      connectedBy: "Admin",
      phoneNumbers: [{ id: 1, phoneNumberId: "p1", displayPhone: "+1234", verifiedName: "V", qualityRating: "GREEN" }],
      createdAt: new Date("2024-01-01"),
    });
  });

  it("scopes query to user companyId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findMany).mockResolvedValue([]);

    await getWhatsAppAccounts();
    expect(prisma.whatsAppAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 100 } }),
    );
  });

  it("includes only active phone numbers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findMany).mockResolvedValue([]);

    await getWhatsAppAccounts();
    expect(prisma.whatsAppAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          phoneNumbers: expect.objectContaining({
            where: { isActive: true },
          }),
        }),
      }),
    );
  });

  it("orders accounts by createdAt descending", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findMany).mockResolvedValue([]);

    await getWhatsAppAccounts();
    expect(prisma.whatsAppAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("strips encrypted tokens from response", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findMany).mockResolvedValue([
      {
        id: 1,
        wabaId: "w1",
        businessName: "B",
        status: "ACTIVE",
        accessToken: "super_secret_token",
        connectedUser: { id: 1, name: "A" },
        phoneNumbers: [],
        createdAt: new Date("2024-01-01"),
      },
    ] as any);

    const res = await getWhatsAppAccounts();
    expect(res[0]).not.toHaveProperty("accessToken");
  });

  it("maps connectedBy to null when connectedUser is null", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findMany).mockResolvedValue([
      {
        id: 1,
        wabaId: "w1",
        businessName: "B",
        status: "ACTIVE",
        connectedUser: null,
        phoneNumbers: [],
        createdAt: new Date("2024-01-01"),
      },
    ] as any);

    const res = await getWhatsAppAccounts();
    expect(res[0].connectedBy).toBeNull();
  });

  it("returns empty array when no accounts", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findMany).mockResolvedValue([]);

    const res = await getWhatsAppAccounts();
    expect(res).toEqual([]);
  });

  it("throws when DB fails (no try/catch)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findMany).mockRejectedValue(new Error("DB connection lost"));

    await expect(getWhatsAppAccounts()).rejects.toThrow("DB connection lost");
  });
});

// ─── disconnectWhatsAppAccount ───────────────────────────────────────────
describe("disconnectWhatsAppAccount", () => {
  it("throws Unauthorized when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(disconnectWhatsAppAccount(1)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking canManageWhatsApp", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(false);

    await expect(disconnectWhatsAppAccount(1)).rejects.toThrow("Forbidden");
  });

  it("throws Account not found when account missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue(null);

    await expect(disconnectWhatsAppAccount(999)).rejects.toThrow("Account not found");
  });

  it("throws Account not found for different company (isolation)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue(null);

    await expect(disconnectWhatsAppAccount(1)).rejects.toThrow("Account not found");
    expect(prisma.whatsAppAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
      select: { id: true },
    });
  });

  it("updates account status to DISCONNECTED", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.whatsAppAccount.update).mockResolvedValue({} as any);
    vi.mocked(prisma.whatsAppPhoneNumber.updateMany).mockResolvedValue({} as any);

    await disconnectWhatsAppAccount(1);
    expect(prisma.whatsAppAccount.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "DISCONNECTED" },
    });
  });

  it("deactivates associated phone numbers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue({ id: 5 } as any);
    vi.mocked(prisma.whatsAppAccount.update).mockResolvedValue({} as any);
    vi.mocked(prisma.whatsAppPhoneNumber.updateMany).mockResolvedValue({} as any);

    await disconnectWhatsAppAccount(5);
    expect(prisma.whatsAppPhoneNumber.updateMany).toHaveBeenCalledWith({
      where: { accountId: 5 },
      data: { isActive: false },
    });
  });

  it("returns success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.whatsAppAccount.update).mockResolvedValue({} as any);
    vi.mocked(prisma.whatsAppPhoneNumber.updateMany).mockResolvedValue({} as any);

    const res = await disconnectWhatsAppAccount(1);
    expect(res).toEqual({ success: true });
  });

  it("throws when whatsAppAccount.update fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.whatsAppAccount.update).mockRejectedValue(new Error("DB update failed"));

    await expect(disconnectWhatsAppAccount(1)).rejects.toThrow("DB update failed");
  });

  it("throws when whatsAppPhoneNumber.updateMany fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(hasUserFlag).mockReturnValue(true);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.whatsAppAccount.update).mockResolvedValue({} as any);
    vi.mocked(prisma.whatsAppPhoneNumber.updateMany).mockRejectedValue(new Error("DB updateMany failed"));

    await expect(disconnectWhatsAppAccount(1)).rejects.toThrow("DB updateMany failed");
  });
});

// ─── getWhatsAppConnectionStatus ─────────────────────────────────────────
describe("getWhatsAppConnectionStatus", () => {
  it("throws Unauthorized when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getWhatsAppConnectionStatus()).rejects.toThrow("Unauthorized");
  });

  it("returns { connected: false } when no active account", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue(null);

    const res = await getWhatsAppConnectionStatus();
    expect(res).toEqual({ connected: false });
  });

  it("returns connected with businessName and phoneNumbers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue({
      id: 1,
      businessName: "My Biz",
      status: "ACTIVE",
      phoneNumbers: [{ displayPhone: "+1234", verifiedName: "V" }],
    } as any);

    const res = await getWhatsAppConnectionStatus();
    expect(res).toEqual({
      connected: true,
      businessName: "My Biz",
      phoneNumbers: [{ displayPhone: "+1234", verifiedName: "V" }],
    });
  });

  it("scopes query to companyId and ACTIVE status", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue(null);

    await getWhatsAppConnectionStatus();
    expect(prisma.whatsAppAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100, status: "ACTIVE" },
      }),
    );
  });

  it("uses correct nested select shape with active phone number filter", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue(null);

    await getWhatsAppConnectionStatus();
    expect(prisma.whatsAppAccount.findFirst).toHaveBeenCalledWith({
      where: { companyId: 100, status: "ACTIVE" },
      select: {
        id: true,
        businessName: true,
        status: true,
        phoneNumbers: {
          where: { isActive: true },
          select: { displayPhone: true, verifiedName: true },
        },
      },
    });
  });

  it("does not require canManageWhatsApp (any authed user)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(basicUser as any);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockResolvedValue(null);

    // Should not throw - basic user without canManageWhatsApp can call this
    const res = await getWhatsAppConnectionStatus();
    expect(res).toEqual({ connected: false });
    expect(hasUserFlag).not.toHaveBeenCalled();
  });

  it("throws when findFirst fails (no try/catch)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
    vi.mocked(prisma.whatsAppAccount.findFirst).mockRejectedValue(new Error("DB down"));

    await expect(getWhatsAppConnectionStatus()).rejects.toThrow("DB down");
  });
});
