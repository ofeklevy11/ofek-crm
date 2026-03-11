import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (accessible inside vi.mock factories) ────────────

const {
  mockGetCurrentUser,
  mockHasUserFlag,
  mockGetDashboardInitialData,
  mockCheckActionRateLimit,
  mockIsRateLimitError,
  MOCK_DASHBOARD_RATE_LIMITS,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockHasUserFlag: vi.fn(),
  mockGetDashboardInitialData: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockIsRateLimitError: vi.fn(),
  MOCK_DASHBOARD_RATE_LIMITS: {
    page: { prefix: "dash-page", max: 120, windowSeconds: 60 },
    read: { prefix: "dash-read", max: 60, windowSeconds: 60 },
    batch: { prefix: "dash-batch", max: 10, windowSeconds: 60 },
  },
}));

// ── Module mocks ───────────────────────────────────────────────────

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}));

vi.mock("@/lib/permissions", () => ({
  hasUserFlag: (...args: any[]) => mockHasUserFlag(...args),
}));

vi.mock("@/app/actions/dashboard", () => ({
  getDashboardInitialData: (...args: any[]) => mockGetDashboardInitialData(...args),
}));

vi.mock("@/lib/rate-limit-action", () => ({
  checkActionRateLimit: (...args: any[]) => mockCheckActionRateLimit(...args),
  DASHBOARD_RATE_LIMITS: MOCK_DASHBOARD_RATE_LIMITS,
}));

vi.mock("@/lib/rate-limit-utils", () => ({
  isRateLimitError: (...args: any[]) => mockIsRateLimitError(...args),
}));

vi.mock("@/components/DashboardClient", () => ({
  default: (props: any) => ({ type: "DashboardClient", props }),
}));

vi.mock("@/components/RateLimitFallback", () => ({
  default: (props: any) => ({ type: "RateLimitFallback", props }),
}));

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_target, name) => (props: any) => ({ type: String(name), props }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => ({ type: "Link", props: { href, ...rest, children } }),
}));

vi.mock("next/font/google", () => ({
  Heebo: () => ({ className: "mock-heebo" }),
}));

// ── Import under test + mocked references ──────────────────────────

import Home from "@/app/page";
import RateLimitFallback from "@/components/RateLimitFallback";
import DashboardClient from "@/components/DashboardClient";
import Link from "next/link";

// ── Helpers ─────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    companyId: 10,
    name: "Test User",
    email: "test@example.com",
    role: "admin",
    allowedWriteTableIds: [],
    permissions: {},
    tablePermissions: {},
    ...overrides,
  };
}

/** Recursively search the JSX tree for an element matching a predicate. */
function findInTree(node: any, predicate: (n: any) => boolean): any | null {
  if (!node) return null;
  if (predicate(node)) return node;
  const children = node?.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findInTree(child, predicate);
      if (found) return found;
    }
  } else if (children && typeof children === "object") {
    return findInTree(children, predicate);
  }
  return null;
}

/** Collect all elements matching a predicate from the JSX tree. */
function findAllInTree(node: any, predicate: (n: any) => boolean, acc: any[] = []): any[] {
  if (!node) return acc;
  if (predicate(node)) acc.push(node);
  const children = node?.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      findAllInTree(child, predicate, acc);
    }
  } else if (children && typeof children === "object") {
    findAllInTree(children, predicate, acc);
  }
  return acc;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Home page component (app/page.tsx)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders marketing page for unauthenticated user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await Home();

    expect(result.props.dir).toBe("rtl");
    expect(result.props.className).toContain("bg-[#f4f8f8]");

    // JSX elements have `type` as the mock function reference — search by reference
    const links = findAllInTree(result, (n) => n?.type === Link);
    const hrefs = links.map((l) => l.props.href);
    expect(hrefs).toContain("/login");
    expect(hrefs).toContain("/register");
    expect(mockGetDashboardInitialData).not.toHaveBeenCalled();
  });

  it("renders RateLimitFallback when page rate-limited", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded" });

    const result = await Home();

    expect(result.type).toBe(RateLimitFallback);
  });

  it("renders dashboard with empty data when user lacks canViewDashboardData", async () => {
    const user = makeUser({ role: "basic", permissions: {} });
    mockGetCurrentUser.mockResolvedValue(user);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(false);

    const result = await Home();

    const dc = findInTree(result, (n) => n?.type === DashboardClient);
    expect(dc).toBeTruthy();
    expect(dc.props.initialAnalytics).toEqual([]);
    expect(dc.props.availableTables).toEqual([]);
    expect(dc.props.availableGoals).toEqual([]);
    expect(dc.props.user).toEqual(user);
    expect(mockGetDashboardInitialData).not.toHaveBeenCalled();
  });

  it("renders dashboard with data when user has permission", async () => {
    const user = makeUser();
    const mockData = {
      analyticsViews: [{ id: 1 }],
      tables: [{ id: 2, views: [] }],
      goals: [{ id: 3 }],
    };
    mockGetCurrentUser.mockResolvedValue(user);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(true);
    mockGetDashboardInitialData.mockResolvedValue(mockData);

    const result = await Home();

    const dc = findInTree(result, (n) => n?.type === DashboardClient);
    expect(dc).toBeTruthy();
    expect(dc.props.initialAnalytics).toEqual(mockData.analyticsViews);
    expect(dc.props.availableTables).toEqual(mockData.tables);
    expect(dc.props.availableGoals).toEqual(mockData.goals);
    expect(dc.props.user).toEqual(user);
  });

  it("renders RateLimitFallback when getDashboardInitialData throws rate-limit error", async () => {
    const thrownError = new Error("Rate limit exceeded");
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(true);
    mockGetDashboardInitialData.mockRejectedValue(thrownError);
    mockIsRateLimitError.mockReturnValue(true);

    const result = await Home();

    expect(result.type).toBe(RateLimitFallback);
    expect(mockIsRateLimitError).toHaveBeenCalledWith(thrownError);
  });

  it("rethrows generic error from getDashboardInitialData", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(true);
    mockGetDashboardInitialData.mockRejectedValue(new Error("DB down"));
    mockIsRateLimitError.mockReturnValue(false);

    await expect(Home()).rejects.toThrow("DB down");
  });

  it("calls checkActionRateLimit with correct args", async () => {
    const user = makeUser({ id: 42 });
    mockGetCurrentUser.mockResolvedValue(user);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(false);

    await Home();

    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      "42",
      MOCK_DASHBOARD_RATE_LIMITS.page,
    );
  });

  it("calls hasUserFlag with user and 'canViewDashboardData'", async () => {
    const user = makeUser();
    mockGetCurrentUser.mockResolvedValue(user);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(false);

    await Home();

    expect(mockHasUserFlag).toHaveBeenCalledWith(user, "canViewDashboardData");
  });

  it("does not call checkActionRateLimit when user is null (early return)", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await Home();

    expect(mockCheckActionRateLimit).not.toHaveBeenCalled();
  });

  it("does not call hasUserFlag when user is null", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await Home();

    expect(mockHasUserFlag).not.toHaveBeenCalled();
  });

  it("does not call getDashboardInitialData when rate limited", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded" });

    await Home();

    expect(mockGetDashboardInitialData).not.toHaveBeenCalled();
  });

  it("renders authenticated dashboard page with dir='rtl'", async () => {
    const user = makeUser();
    mockGetCurrentUser.mockResolvedValue(user);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(true);
    mockGetDashboardInitialData.mockResolvedValue({
      analyticsViews: [],
      tables: [],
      goals: [],
    });

    const result = await Home();

    expect(result.props.dir).toBe("rtl");
  });
});
