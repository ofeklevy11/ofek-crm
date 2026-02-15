import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { verifyUserId } from "@/lib/auth";
import { User } from "@/lib/permissions";
import { redis } from "@/lib/redis";

const USER_SELECT = {
  id: true,
  companyId: true,
  name: true,
  email: true,
  role: true,
  isPremium: true,
  allowedWriteTableIds: true,
  permissions: true,
  tablePermissions: true,
  company: {
    select: {
      name: true,
      slug: true,
    },
  },
} as const;

const USER_CACHE_TTL = 300; // 5 minutes

function userCacheKey(userId: number) {
  return `user:session:${userId}`;
}

async function fetchUserWithCache(userId: number): Promise<User | null> {
  // 1. Try Redis cache first
  try {
    const cached = await redis.get(userCacheKey(userId));
    if (cached) {
      return JSON.parse(cached) as User;
    }
  } catch {
    // Redis down — fall through to DB
  }

  // 2. Query DB
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SELECT,
  });

  if (!user) return null;

  // 3. Populate cache (fire-and-forget)
  try {
    redis.set(userCacheKey(user.id), JSON.stringify(user), "EX", USER_CACHE_TTL);
  } catch {
    // Non-critical — next request will try again
  }

  return user as unknown as User;
}

/**
 * Invalidate the cached user session.
 * Call this after any user profile / permission update.
 *
 * Verified callsites:
 *  - app/actions/users.ts         → updateUser (profile/permission changes)
 *  - app/api/users/[id]/route.ts  → PATCH handler (role/permission updates)
 *
 * If you add a new path that modifies user permissions, role, or company
 * association, you MUST call invalidateUserCache(userId) after the write
 * to prevent stale permission checks (up to 5 min with current TTL).
 */
export async function invalidateUserCache(userId: number) {
  try {
    await redis.del(userCacheKey(userId));
  } catch {
    // Non-critical
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: number): Promise<User | null> {
  try {
    return await fetchUserWithCache(userId);
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

/**
 * Get the current authenticated user from the session cookie.
 * Wrapped with React.cache() to deduplicate within a single server request.
 * Also uses Redis to cache across requests (5 min TTL).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
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

    return await fetchUserWithCache(userId);
  } catch (error) {
    console.error("Error fetching current user:", error);
    return null;
  }
});
