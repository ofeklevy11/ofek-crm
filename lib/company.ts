import { getCurrentUser } from "@/lib/permissions-server";

/**
 * Get the current user's company ID
 * This is a utility function to be used in server actions and API routes
 * to ensure data isolation between companies
 */
export async function getCurrentCompanyId(): Promise<number | null> {
  const user = await getCurrentUser();
  return user?.companyId ?? null;
}

/**
 * Ensure the user is authenticated and return their company ID
 * Throws an error if the user is not authenticated
 */
export async function requireCompanyId(): Promise<number> {
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    throw new Error("Unauthorized: User must be logged in");
  }
  return companyId;
}
