import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getCurrentUser, invalidateUserCache } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAuditLog } from "@/lib/audit";
import { patchUserSchema } from "@/lib/validations/user";
import { isPrismaError } from "@/lib/prisma-error";
import { withRetry } from "@/lib/db-retry";
import { revokeUserSessions } from "@/lib/session";
import { createLogger } from "@/lib/logger";
import { logSecurityEvent, SEC_PASSWORD_CHANGED, SEC_ROLE_CHANGED, SEC_PERMISSIONS_CHANGED } from "@/lib/security/audit-security";

const log = createLogger("UsersAPI");

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (rl) return rl;

    const { id } = await params;
    const targetUserId = parseId(id);
    if (!targetUserId) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    // Allow self-access; otherwise require canViewUsers
    const isSelf = user.id === targetUserId;
    if (!isSelf && !hasUserFlag(user, "canViewUsers")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // CRITICAL: Filter by companyId - can only see users in same company
    const targetUser = await withRetry(() => prisma.user.findFirst({
      where: {
        id: targetUserId,
        companyId: user.companyId,
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

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(targetUser);
  } catch (error) {
    log.error("Error fetching user", { error: (error as Error).message });
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.userManagement);
    if (rl) return rl;

    const { id } = await params;
    const targetUserId = parseId(id);
    if (!targetUserId) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    let raw;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = patchUserSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, password, role, allowedWriteTableIds, permissions, tablePermissions } = parsed.data;

    // Start bcrypt early so it runs in parallel with DB checks
    const hashPromise = password ? bcrypt.hash(password, 12) : null;

    // Check if user exists and belongs to company
    const existingUser = await withRetry(() => prisma.user.findFirst({
      where: {
        id: targetUserId,
        companyId: user.companyId,
      },
      select: { id: true, email: true, role: true },
    }));

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Authorization: non-admins can only update their own name/password
    const isSelf = user.id === targetUserId;
    const isAdmin = user.role === "admin";
    const sensitiveFields = [role, permissions, tablePermissions, allowedWriteTableIds, email].some(
      (v) => v !== undefined
    );

    if (!isAdmin) {
      if (!isSelf) {
        return NextResponse.json(
          { error: "Only admins can update other users" },
          { status: 403 }
        );
      }
      if (sensitiveFields) {
        return NextResponse.json(
          { error: "Only admins can change role, permissions, or email" },
          { status: 403 }
        );
      }
    }

    // Only admins can assign admin role
    if (role === "admin" && !isAdmin) {
      return NextResponse.json(
        { error: "Only admins can assign admin role" },
        { status: 403 }
      );
    }

    // Check if email is taken by another user — generic error to prevent enumeration
    if (email && email !== existingUser.email) {
      const emailTaken = await withRetry(() => prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }));
      if (emailTaken) {
        return NextResponse.json(
          { error: "Unable to update user with the provided details" },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (allowedWriteTableIds !== undefined)
      updateData.allowedWriteTableIds = allowedWriteTableIds;
    if (hashPromise) {
      updateData.passwordHash = await hashPromise;
    }
    if (permissions) updateData.permissions = permissions;
    if (tablePermissions) updateData.tablePermissions = tablePermissions;

    // SECURITY: Atomic companyId check prevents TOCTOU race
    const updatedUser = await withRetry(() => prisma.user.update({
      where: { id: targetUserId, companyId: user.companyId },
      data: updateData,
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

    // Fire-and-forget audit log (catches its own errors)
    createAuditLog(
      null,
      user.id,
      "USER_UPDATED",
      { targetUserId, changes: Object.keys(updateData) },
      prisma,
      user.companyId,
    );

    // Security events for sensitive changes (already fire-and-forget)
    if (password) {
      logSecurityEvent({ action: SEC_PASSWORD_CHANGED, companyId: user.companyId, userId: user.id, details: { targetUserId, changedBy: user.id } });
    }
    if (role && role !== existingUser.role) {
      logSecurityEvent({ action: SEC_ROLE_CHANGED, companyId: user.companyId, userId: user.id, details: { targetUserId, oldRole: existingUser.role, newRole: role } });
    }
    if (permissions || tablePermissions) {
      logSecurityEvent({ action: SEC_PERMISSIONS_CHANGED, companyId: user.companyId, userId: user.id, details: { targetUserId } });
    }

    // Must-await operations in parallel
    const postOps: Promise<void>[] = [invalidateUserCache(targetUserId)];
    if (password) postOps.push(revokeUserSessions(targetUserId));
    await Promise.all(postOps);

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      return NextResponse.json(
        { error: "Unable to update user with the provided details" },
        { status: 400 }
      );
    }
    if (isPrismaError(error, "P2025")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    log.error("Error updating user", { error: (error as Error).message });
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "admin") {
      return NextResponse.json({ error: "Only admins can delete users" }, { status: 403 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.userManagement);
    if (rl) return rl;

    const { id } = await params;
    const targetUserId = parseId(id);
    if (!targetUserId) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    // Check if user exists and belongs to company
    const existingUser = await withRetry(() => prisma.user.findFirst({
      where: {
        id: targetUserId,
        companyId: user.companyId,
      },
      select: { id: true, email: true },
    }));

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent deleting yourself
    if (existingUser.id === user.id) {
      return NextResponse.json(
        { error: "Cannot delete yourself" },
        { status: 400 }
      );
    }

    // Delete user
    await withRetry(() => prisma.user.delete({
      where: { id: targetUserId, companyId: user.companyId },
    }));

    // Invalidate cached session so deleted user loses access immediately
    await invalidateUserCache(targetUserId);

    // Fire-and-forget audit log (catches its own errors)
    createAuditLog(
      null,
      user.id,
      "USER_DELETED",
      { targetUserId, email: existingUser.email },
      prisma,
      user.companyId,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    log.error("Error deleting user", { error: (error as Error).message });
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
