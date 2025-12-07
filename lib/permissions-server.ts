import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { verifyUserId } from "@/lib/auth";
import { User } from "@/lib/permissions";

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
        permissions: true,
      },
    });
    // Cast to User to ensure type compatibility (Prisma Json type vs User interface)
    return user as unknown as User | null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

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
        permissions: true,
      },
    });

    // Cast to User to ensure type compatibility (Prisma Json type vs User interface)
    return user as unknown as User | null;
  } catch (error) {
    console.error("Error fetching current user:", error);
    return null;
  }
}
