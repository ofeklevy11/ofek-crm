import { prisma } from "@/lib/prisma";

export type UserRole = "basic" | "manager" | "admin";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  allowedWriteTableIds: number[];
}

/**
 * Check if user has read access to a table
 * All roles have read access to all tables
 */
export function canReadTable(user: User, tableId: number): boolean {
  return true; // All users can read all tables
}

/**
 * Check if user has write access to a table
 * - admin: can write to all tables
 * - manager: can write to tables in allowedWriteTableIds
 * - basic: cannot write to any table
 */
export function canWriteTable(user: User, tableId: number): boolean {
  if (user.role === "admin") {
    return true;
  }
  if (user.role === "manager") {
    return user.allowedWriteTableIds.includes(tableId);
  }
  return false; // basic users have no write access
}

/**
 * Check if user can manage other users
 * Only admin can manage users
 */
export function canManageUsers(user: User): boolean {
  return user.role === "admin";
}

/**
 * Check if user can create/delete tables
 * Only admin can manage tables
 */
export function canManageTables(user: User): boolean {
  return user.role === "admin";
}

/**
 * Get user by ID
 */
export async function getUserById(userId: number): Promise<User | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        allowedWriteTableIds: true,
      },
    });
    return user as User | null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

import { cookies } from "next/headers";
import { verifyUserId } from "@/lib/auth";

/**
 * Get the current authenticated user from the session cookie
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) {
      return null;
    }

    const userId = verifyUserId(token);

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        allowedWriteTableIds: true,
      },
    });

    return user as User | null;
  } catch (error) {
    console.error("Error fetching current user:", error);
    return null;
  }
}
