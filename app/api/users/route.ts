import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAuditLog } from "@/lib/audit";
import { createUserSchema } from "@/lib/validations/user";
import { isPrismaError } from "@/lib/prisma-error";
import { withRetry } from "@/lib/db-retry";
import { createLogger } from "@/lib/logger";

const log = createLogger("UsersListAPI");

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(currentUser.id), RATE_LIMITS.api);
    if (rl) return rl;

    if (!hasUserFlag(currentUser, "canViewUsers")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // CRITICAL: Filter by companyId
    const users = await withRetry(() => prisma.user.findMany({
      where: {
        companyId: currentUser.companyId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        allowedWriteTableIds: true,
        createdAt: true,
        updatedAt: true,
        permissions: true,
        tablePermissions: true,
      },
      take: 500,
    }));
    return NextResponse.json(users);
  } catch (error) {
    log.error("Failed to fetch users", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (currentUser.role !== "admin" && currentUser.role !== "manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rl = await checkRateLimit(String(currentUser.id), RATE_LIMITS.userManagement);
    if (rl) return rl;

    let raw;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = createUserSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, password, role, permissions, tablePermissions, allowedWriteTableIds } = parsed.data;

    // Only admins can assign admin role
    if (role === "admin" && currentUser.role !== "admin") {
      return NextResponse.json({ error: "Only admins can assign admin role" }, { status: 403 });
    }

    // Managers cannot create manager-level users
    if (role === "manager" && currentUser.role === "manager") {
      return NextResponse.json({ error: "Managers cannot create manager-level users" }, { status: 403 });
    }

    // Manager privilege escalation prevention:
    // Managers can only grant permissions they themselves hold
    let safePermissions = permissions || {};
    let safeTablePermissions = tablePermissions || {};
    let safeAllowedWriteTableIds = allowedWriteTableIds || [];

    if (currentUser.role === "manager") {
      const managerPerms = (currentUser.permissions || {}) as Record<string, boolean>;
      safePermissions = Object.fromEntries(
        Object.entries(safePermissions).filter(([key]) => managerPerms[key] === true)
      );

      const managerTablePerms = (currentUser.tablePermissions || {}) as Record<string, string>;
      safeTablePermissions = Object.fromEntries(
        Object.entries(safeTablePermissions).filter(([tableId]) => tableId in managerTablePerms)
      );

      const managerWriteIds = new Set(currentUser.allowedWriteTableIds || []);
      safeAllowedWriteTableIds = safeAllowedWriteTableIds.filter((id) => managerWriteIds.has(id));
    }

    // Check if email already exists — generic error to prevent enumeration
    const existingUser = await withRetry(() => prisma.user.findUnique({
      where: { email },
    }));

    if (existingUser) {
      return NextResponse.json(
        { error: "Unable to create user with the provided details" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await withRetry(() => prisma.user.create({
      data: {
        companyId: currentUser.companyId,
        name,
        email,
        passwordHash,
        role: role || "basic",
        allowedWriteTableIds: safeAllowedWriteTableIds,
        permissions: safePermissions,
        tablePermissions: safeTablePermissions,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        allowedWriteTableIds: true,
        createdAt: true,
        updatedAt: true,
        permissions: true,
        tablePermissions: true,
      },
    }));

    await createAuditLog(
      null,
      currentUser.id,
      "USER_CREATED",
      { targetUserId: user.id, email: user.email, role: user.role },
      prisma,
      currentUser.companyId,
    );

    return NextResponse.json(user);
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      return NextResponse.json(
        { error: "Unable to create user with the provided details" },
        { status: 400 }
      );
    }
    log.error("Failed to create user", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
