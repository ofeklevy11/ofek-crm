import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";

// ── Mocks (infrastructure only — keep DB + Redis real) ─────────────
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    register: { prefix: "reg", max: 10, windowSeconds: 900 },
    login: { prefix: "login", max: 20, windowSeconds: 900 },
    loginAccount: { prefix: "login-acct", max: 10, windowSeconds: 1800 },
    verifyEmail: { prefix: "verify", max: 10, windowSeconds: 900 },
    api: { prefix: "api", max: 100, windowSeconds: 60 },
  },
}));

// Mock email sending
const mockSendVerificationEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
}));

// Mock audit-security (fire-and-forget, not essential for auth logic)
vi.mock("@/lib/security/audit-security", () => ({
  logSecurityEvent: vi.fn(),
  SEC_LOGIN_SUCCESS: "LOGIN_SUCCESS",
  SEC_LOGIN_FAILED: "LOGIN_FAILED",
  SEC_REGISTER: "REGISTER",
  SEC_LOGOUT: "LOGOUT",
}));

// Mock request-ip (test requests won't have real IPs)
vi.mock("@/lib/request-ip", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock next/headers cookies() for routes that use it
const mockCookieStore = new Map<string, { name: string; value: string; options?: unknown }>();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) => {
      const entry = mockCookieStore.get(name);
      return entry ? { name: entry.name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options?: unknown) => {
      mockCookieStore.set(name, { name, value, options });
    },
    delete: (name: string) => {
      mockCookieStore.delete(name);
    },
  }),
}));

// Mock permissions-server for /me route
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
  invalidateUserCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock session revocation (uses real Redis, but we mock to verify calls)
vi.mock("@/lib/session", () => ({
  revokeUserSessions: vi.fn().mockResolvedValue(undefined),
}));

// ── Real imports ───────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { verifyUserId, signUserId } from "@/lib/auth";
import { getCurrentUser } from "@/lib/permissions-server";
import { revokeUserSessions } from "@/lib/session";

// Redis uses lazyConnect — ensure it's connected before tests
beforeAll(async () => {
  if (redis.status === "wait") {
    await redis.connect();
  }
}, 10000);

import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as verifyEmailPOST } from "@/app/api/auth/verify-email/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { GET as meGET } from "@/app/api/auth/me/route";

// ── Helpers ────────────────────────────────────────────────────────

const keyPrefix = process.env.NODE_ENV === "production" ? "prod:app:" : "dev:app:";

function makeJsonReq(body: unknown, contentLength?: number): Request {
  const bodyStr = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (contentLength !== undefined) {
    headers["content-length"] = String(contentLength);
  }
  return new Request("http://localhost:3000/api/auth/test", {
    method: "POST",
    headers,
    body: bodyStr,
  });
}

function uniqueEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

// ── State ──────────────────────────────────────────────────────────
const createdCompanyIds: number[] = [];
const createdUserEmails: string[] = [];
const redisKeysToClean: string[] = [];

async function cleanup() {
  // Clean up Redis keys (without prefix — redis client adds it)
  for (const key of redisKeysToClean) {
    await redis.del(key).catch(() => {});
  }
  redisKeysToClean.length = 0;

  // Clean DB in order
  for (const email of createdUserEmails) {
    await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  }
  createdUserEmails.length = 0;

  for (const id of createdCompanyIds) {
    await prisma.company.delete({ where: { id } }).catch(() => {});
  }
  createdCompanyIds.length = 0;
}

afterEach(() => {
  mockCookieStore.clear();
  mockSendVerificationEmail.mockClear();
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(revokeUserSessions).mockClear();
});

afterAll(async () => {
  await cleanup();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  it("400 for missing fields", async () => {
    const res = await registerPOST(makeJsonReq({ email: "a@b.com" }));
    expect(res.status).toBe(400);
  });

  it("400 for invalid email format", async () => {
    const res = await registerPOST(
      makeJsonReq({ name: "Test", email: "not-an-email", password: "password1234", companyName: "Co", isNewCompany: true }),
    );
    expect(res.status).toBe(400);
  });

  it("400 for password too short", async () => {
    const res = await registerPOST(
      makeJsonReq({ name: "Test", email: uniqueEmail(), password: "short", companyName: "Co", isNewCompany: true }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when isNewCompany is false", async () => {
    const res = await registerPOST(
      makeJsonReq({ name: "Test", email: uniqueEmail(), password: "password1234", companyName: "Co", isNewCompany: false }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when email already exists", async () => {
    // Seed a user first
    const company = await prisma.company.create({ data: { name: "Existing Co", slug: `existing-${Date.now()}` } });
    createdCompanyIds.push(company.id);
    const email = uniqueEmail();
    await prisma.user.create({
      data: { companyId: company.id, name: "Existing", email, passwordHash: "hash", role: "admin" },
    });
    createdUserEmails.push(email);

    const res = await registerPOST(
      makeJsonReq({ name: "Test", email, password: "password1234", companyName: "Co", isNewCompany: true }),
    );
    expect(res.status).toBe(400);
  }, 10000);

  it("200 → requiresVerification and stores OTP in Redis", async () => {
    const email = uniqueEmail();
    const res = await registerPOST(
      makeJsonReq({ name: "Test User", email, password: "password1234", companyName: "Test Co", isNewCompany: true }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.requiresVerification).toBe(true);

    // Verify OTP stored in Redis
    const redisKey = `pending-reg:${email.toLowerCase()}`;
    redisKeysToClean.push(redisKey);
    const raw = await redis.get(redisKey);
    expect(raw).toBeTruthy();
    const pending = JSON.parse(raw!);
    expect(pending.code).toMatch(/^\d{6}$/);
    expect(pending.name).toBe("Test User");
    expect(pending.companyName).toBe("Test Co");

    // Verify email mock was called
    expect(mockSendVerificationEmail).toHaveBeenCalledWith(email, pending.code);
  }, 15000);

  it("413 for oversized body", async () => {
    const res = await registerPOST(
      makeJsonReq({ name: "Test", email: uniqueEmail(), password: "password1234", companyName: "Co", isNewCompany: true }, 5000),
    );
    expect(res.status).toBe(413);
  });
});

describe("POST /api/auth/verify-email", () => {
  it("400 for missing email/code", async () => {
    const res = await verifyEmailPOST(makeJsonReq({ email: "a@b.com" }));
    expect(res.status).toBe(400);
  });

  it("400 when no pending registration in Redis", async () => {
    const res = await verifyEmailPOST(
      makeJsonReq({ email: uniqueEmail(), code: "123456" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 for wrong code", async () => {
    const email = uniqueEmail();
    const redisKey = `pending-reg:${email}`;
    redisKeysToClean.push(redisKey);
    await redis.set(
      redisKey,
      JSON.stringify({ code: "111111", name: "Test", passwordHash: "$2a$12$test", companyName: "Co", isNewCompany: true }),
      "EX",
      3600,
    );

    const res = await verifyEmailPOST(makeJsonReq({ email, code: "999999" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("שגוי");
  });

  it("200 → creates company + user and sets auth_token cookie", async () => {
    const email = uniqueEmail();
    const redisKey = `pending-reg:${email}`;
    redisKeysToClean.push(redisKey);

    // Use bcrypt to create a real hash for the pending registration
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash("password1234", 4); // low rounds for speed

    await redis.set(
      redisKey,
      JSON.stringify({ code: "123456", name: "Verified User", passwordHash, companyName: "Verified Co", isNewCompany: true }),
      "EX",
      3600,
    );

    const res = await verifyEmailPOST(makeJsonReq({ email, code: "123456" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.role).toBe("admin");
    expect(json.company.name).toBe("Verified Co");

    // Track for cleanup
    createdUserEmails.push(email);
    createdCompanyIds.push(json.company.id);

    // Verify user + company created in DB
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeTruthy();
    expect(user!.companyId).toBe(json.company.id);

    // Verify pending-reg key deleted from Redis
    const raw = await redis.get(redisKey);
    expect(raw).toBeNull();

    // Verify auth_token cookie set
    const cookie = mockCookieStore.get("auth_token");
    expect(cookie).toBeTruthy();
    expect(cookie!.value).toBeTruthy();
    // Verify token is valid
    const userId = verifyUserId(cookie!.value);
    expect(userId).toBe(user!.id);
  }, 15000);
});

describe("POST /api/auth/login", () => {
  let testEmail: string;
  let testUserId: number;

  beforeAll(async () => {
    testEmail = uniqueEmail();
    const company = await prisma.company.create({ data: { name: "Login Co", slug: `login-${Date.now()}` } });
    createdCompanyIds.push(company.id);
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correctpassword", 4);
    const user = await prisma.user.create({
      data: { companyId: company.id, name: "Login User", email: testEmail, passwordHash: hash, role: "admin" },
    });
    createdUserEmails.push(testEmail);
    testUserId = user.id;
  });

  it("400 for missing fields", async () => {
    const res = await loginPOST(makeJsonReq({ email: testEmail }));
    expect(res.status).toBe(400);
  });

  it("401 for non-existent email", async () => {
    const res = await loginPOST(makeJsonReq({ email: "nobody@test.com", password: "whatever1234" }));
    expect(res.status).toBe(401);
  }, 10000);

  it("401 for wrong password", async () => {
    const res = await loginPOST(makeJsonReq({ email: testEmail, password: "wrongpassword" }));
    expect(res.status).toBe(401);
  }, 10000);

  it("200 with user data for correct credentials", async () => {
    const res = await loginPOST(makeJsonReq({ email: testEmail, password: "correctpassword" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.id).toBe(testUserId);
    expect(json.user.name).toBe("Login User");
    expect(json.user.role).toBe("admin");

    // Verify auth_token cookie was set
    const cookie = mockCookieStore.get("auth_token");
    expect(cookie).toBeTruthy();
    const userId = verifyUserId(cookie!.value);
    expect(userId).toBe(testUserId);
  }, 10000);

  it("413 for oversized body", async () => {
    const res = await loginPOST(makeJsonReq({ email: testEmail, password: "x" }, 3000));
    expect(res.status).toBe(413);
  });
});

describe("POST /api/auth/logout", () => {
  it("200 even without token (graceful)", async () => {
    const res = await logoutPOST(makeJsonReq({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("200 with valid token → calls revokeUserSessions and clears cookie", async () => {
    // Seed a user for logout
    const company = await prisma.company.create({ data: { name: "Logout Co", slug: `logout-${Date.now()}` } });
    createdCompanyIds.push(company.id);
    const email = uniqueEmail();
    const user = await prisma.user.create({
      data: { companyId: company.id, name: "Logout User", email, passwordHash: "hash", role: "basic" },
    });
    createdUserEmails.push(email);

    // Set auth_token cookie
    const token = signUserId(user.id);
    mockCookieStore.set("auth_token", { name: "auth_token", value: token });

    const res = await logoutPOST(makeJsonReq({}));
    expect(res.status).toBe(200);

    // Verify revokeUserSessions was called
    expect(revokeUserSessions).toHaveBeenCalledWith(user.id);

    // Verify cookie was deleted
    expect(mockCookieStore.has("auth_token")).toBe(false);
  });
});

describe("GET /api/auth/me", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await meGET();
    expect(res.status).toBe(401);
  });

  it("200 with user object when authenticated", async () => {
    const mockUser = {
      id: 1,
      companyId: 1,
      name: "Test User",
      email: "test@test.com",
      role: "admin",
      permissions: {},
      tablePermissions: {},
      allowedWriteTableIds: [],
    };
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser as any);
    const res = await meGET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Test User");
    expect(json.role).toBe("admin");
  });
});

describe("Full auth flow", () => {
  it("register → verify-email → login → me → logout", async () => {
    const email = uniqueEmail();
    const password = "securepassword123";

    // 1. Register
    const regRes = await registerPOST(
      makeJsonReq({ name: "Flow User", email, password, companyName: "Flow Co", isNewCompany: true }),
    );
    expect(regRes.status).toBe(200);
    const regJson = await regRes.json();
    expect(regJson.requiresVerification).toBe(true);

    // Get OTP from Redis
    const redisKey = `pending-reg:${email.toLowerCase()}`;
    redisKeysToClean.push(redisKey);
    const raw = await redis.get(redisKey);
    const { code } = JSON.parse(raw!);

    // 2. Verify email
    mockCookieStore.clear();
    const verifyRes = await verifyEmailPOST(makeJsonReq({ email, code }));
    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.success).toBe(true);
    createdUserEmails.push(email);
    createdCompanyIds.push(verifyJson.company.id);

    // 3. Login
    mockCookieStore.clear();
    const loginRes = await loginPOST(makeJsonReq({ email, password }));
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.user.name).toBe("Flow User");

    // Verify cookie set
    const loginCookie = mockCookieStore.get("auth_token");
    expect(loginCookie).toBeTruthy();

    // 4. Me
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: loginJson.user.id,
      companyId: verifyJson.company.id,
      name: "Flow User",
      email,
      role: "admin",
      permissions: {},
      tablePermissions: {},
      allowedWriteTableIds: [],
    } as any);
    const meRes = await meGET();
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.name).toBe("Flow User");

    // 5. Logout
    const logoutRes = await logoutPOST(makeJsonReq({}));
    expect(logoutRes.status).toBe(200);
    expect(revokeUserSessions).toHaveBeenCalled();
  }, 30000);
});
