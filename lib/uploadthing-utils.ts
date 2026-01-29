/**
 * Utility functions for secure UploadThing file handling.
 *
 * IMPORTANT: These functions construct URLs server-side to prevent SSRF attacks.
 * Never accept file URLs directly from user input - only accept fileKey and build URLs here.
 */

// Allowed hostname for UploadThing files
const UPLOADTHING_HOST = "utfs.io";

/**
 * Constructs a secure, verified URL for an UploadThing file.
 *
 * @param fileKey - The unique file key from UploadThing (e.g., "abc123xyz.csv")
 * @returns The full URL to access the file
 * @throws Error if fileKey is invalid or potentially malicious
 */
export function buildUploadThingUrl(fileKey: string): string {
  // Validate fileKey format - should be alphanumeric with possible dashes/underscores and extension
  // UploadThing keys are typically format: randomString.extension or folder/randomString.extension
  if (!fileKey || typeof fileKey !== "string") {
    throw new Error("Invalid fileKey: must be a non-empty string");
  }

  // Prevent path traversal and injection attacks
  if (
    fileKey.includes("..") ||
    fileKey.includes("://") ||
    fileKey.includes("\\") ||
    fileKey.startsWith("/") ||
    fileKey.startsWith(".")
  ) {
    throw new Error(
      "Invalid fileKey: contains forbidden characters or patterns",
    );
  }

  // Validate key format - allow alphanumeric, dashes, underscores, dots, and forward slashes
  // UploadThing uses keys like "abc123.csv" or "f/abc123.csv"
  const validKeyPattern = /^[a-zA-Z0-9\-_./]+$/;
  if (!validKeyPattern.test(fileKey)) {
    throw new Error("Invalid fileKey: contains invalid characters");
  }

  // Build the secure URL using only the allowed host
  return `https://${UPLOADTHING_HOST}/f/${fileKey}`;
}

/**
 * Validates that a given URL belongs to UploadThing.
 * Use this only when you MUST accept a URL (e.g., for backward compatibility during migration).
 * Prefer using buildUploadThingUrl with fileKey whenever possible.
 *
 * @param url - The URL to validate
 * @returns true if the URL is a valid UploadThing URL, false otherwise
 */
export function isValidUploadThingUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === UPLOADTHING_HOST && parsedUrl.protocol === "https:"
    );
  } catch {
    return false;
  }
}
