const SAFE_HOSTS = ["utfs.io", "uploadthing.com", "ufs.sh"];

/**
 * Check if a URL points to a known safe storage host (UploadThing).
 * Used to prevent SSRF when the server proxies file downloads.
 */
export function isSafeStorageUrl(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr);
    return SAFE_HOSTS.some(
      (h) => hostname === h || hostname.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}
