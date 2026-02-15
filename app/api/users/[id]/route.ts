import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getCurrentUser, invalidateUserCache } from "@/lib/permissions-server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const targetUserId = parseInt(id);

    // CRITICAL: Filter by companyId - can only see users in same company
    const targetUser = await prisma.user.findFirst({
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
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(targetUser);
  } catch (error) {
    console.error("Error fetching user:", error);
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

    const { id } = await params;
    const targetUserId = parseInt(id);
    const body = await request.json();
    const {
      name,
      email,
      password,
      role,
      allowedWriteTableIds,
      permissions,
      tablePermissions,
    } = body;

    // Check if user exists and belongs to company
    const existingUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        companyId: user.companyId,
      },
    });

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

    // Check if email is taken by another user
    if (email && email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email },
      });
      if (emailTaken) {
        return NextResponse.json(
          { error: "Email already exists" },
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
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }
    if (permissions) updateData.permissions = permissions;
    if (tablePermissions) updateData.tablePermissions = tablePermissions;

    // SECURITY: Atomic companyId check prevents TOCTOU race
    const updatedUser = await prisma.user.update({
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
    });

    // Invalidate cached session so permission changes take effect immediately
    await invalidateUserCache(targetUserId);

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
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

    const { id } = await params;
    const targetUserId = parseInt(id);

    // Check if user exists and belongs to company
    const existingUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        companyId: user.companyId,
      },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent deleting yourself? (Optional safety)
    if (existingUser.id === user.id) {
      return NextResponse.json(
        { error: "Cannot delete yourself" },
        { status: 400 }
      );
    }

    // Delete user
    await prisma.user.delete({
      where: { id: targetUserId, companyId: user.companyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
