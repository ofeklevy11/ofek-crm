import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (accessible inside vi.mock factories) ────────────

const {
  mockGetCurrentUser,
  mockHasUserFlag,
  mockGetDashboardInitialData,
  mockCheckActionRateLimit,
  mockIsRateLimitError,
  mockRedirect,
  MOCK_DASHBOARD_RATE_LIMITS,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockHasUserFlag: vi.fn(),
  mockGetDashboardInitialData: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockIsRateLimitError: vi.fn(),
  mockRedirect: vi.fn(),
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

vi.mock("@/components/LandingPage", () => ({
  default: () => ({ type: "LandingPage", props: {} }),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => {
    mockRedirect(...args);
    throw new Error(`NEXT_REDIRECT:${args[0]}`);
  },
}));

// ── Import under test + mocked references ──────────────────────────

import Home from "@/app/page";
import DashboardPage from "@/app/dashboard/page";
import RateLimitFallback from "@/components/RateLimitFallback";
import DashboardClient from "@/components/DashboardClient";

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

// ── Tests ──────────────────────────────────────────────────────────

describe("Home page (app/page.tsx)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders LandingPage for unauthenticated user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const result = await Home();

    expect(result.type).toBe("LandingPage");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects authenticated user to /dashboard", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });
});

describe("Dashboard page (app/dashboard/page.tsx)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("redirects to /login when user is null", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("renders RateLimitFallback when page rate-limited", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded" });

    const result = await DashboardPage();

    expect(result.type).toBe(RateLimitFallback);
  });

  it("renders dashboard with empty data when user lacks canViewDashboardData", async () => {
    const user = makeUser({ role: "basic", permissions: {} });
    mockGetCurrentUser.mockResolvedValue(user);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(false);

    const result = await DashboardPage();

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

    const result = await DashboardPage();

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

    const result = await DashboardPage();

    expect(result.type).toBe(RateLimitFallback);
    expect(mockIsRateLimitError).toHaveBeenCalledWith(thrownError);
  });

  it("rethrows generic error from getDashboardInitialData", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(true);
    mockGetDashboardInitialData.mockRejectedValue(new Error("DB down"));
    mockIsRateLimitError.mockReturnValue(false);

    await expect(DashboardPage()).rejects.toThrow("DB down");
  });

  it("calls checkActionRateLimit with correct args", async () => {
    const user = makeUser({ id: 42 });
    mockGetCurrentUser.mockResolvedValue(user);
    mockCheckActionRateLimit.mockResolvedValue(null);
    mockHasUserFlag.mockReturnValue(false);

    await DashboardPage();

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

    await DashboardPage();

    expect(mockHasUserFlag).toHaveBeenCalledWith(user, "canViewDashboardData");
  });

  it("does not call getDashboardInitialData when rate limited", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockCheckActionRateLimit.mockResolvedValue({ error: "Rate limit exceeded" });

    await DashboardPage();

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

    const result = await DashboardPage();

    expect(result.props.dir).toBe("rtl");
  });
});
