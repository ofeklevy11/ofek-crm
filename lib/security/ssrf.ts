import { isIP } from "net";

/**
 * Convert a decimal IP (e.g. 2130706433) to dotted IPv4 notation (127.0.0.1).
 * Returns null if the value is not a valid decimal IP.
 */
function decimalToIPv4(hostname: string): string | null {
  if (!/^\d+$/.test(hostname)) return null;
  const num = Number(hostname);
  if (!Number.isFinite(num) || num < 0 || num > 0xffffffff) return null;
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join(".");
}

/**
 * Extract the IPv4 address from an IPv4-mapped IPv6 address (::ffff:x.x.x.x).
 * Returns null if the address is not an IPv4-mapped IPv6.
 */
function extractIPv4Mapped(hostname: string): string | null {
  // Handles both ::ffff:1.2.3.4 and ::ffff:0102:0304 forms
  const match = hostname.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (match) return match[1];

  // Hex form: ::ffff:7f00:0001 -> 127.0.0.1
  const hexMatch = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexMatch) {
    const hi = parseInt(hexMatch[1], 16);
    const lo = parseInt(hexMatch[2], 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join(".");
  }
  return null;
}

/**
 * Check if an IPv4 address (dotted notation) is in a private/reserved range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true; // malformed → block

  const [a, b] = parts;
  if (a === 0) return true;                              // 0.0.0.0/8
  if (a === 10) return true;                             // 10.0.0.0/8
  if (a === 127) return true;                            // 127.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;      // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                // 192.168.0.0/16
  if (a === 169 && b === 254) return true;                // 169.254.0.0/16 link-local
  if (a === 100 && b >= 64 && b <= 127) return true;      // 100.64.0.0/10 CGN
  if (a === 198 && (b === 18 || b === 19)) return true;   // 198.18.0.0/15 Benchmarking
  if (a >= 240) return true;                               // 240.0.0.0/4 Reserved
  return false;
}

/**
 * Check if an IPv6 address is in a private/reserved range.
 */
function isPrivateIPv6(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "::1") return true;                       // loopback
  if (lower.startsWith("fe80")) return true;              // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local (fc00::/7)
  if (lower.startsWith("::ffff:")) return true;           // IPv4-mapped — handled separately
  if (lower === "::") return true;                          // unspecified address
  if (lower.startsWith("ff")) return true;                  // ff00::/8 multicast
  return false;
}

/**
 * Validate a URL against SSRF — block private/internal IPs and hostnames.
 * Returns true if the URL targets a private/internal address that should be blocked.
 */
export function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);

    // Only allow http and https schemes
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return true;
    }

    // url.hostname strips brackets from IPv6 addresses
    const hostname = url.hostname.toLowerCase();

    // Block common private/internal hostnames
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal" ||
      hostname === "instance-data" ||
      hostname.endsWith(".svc.cluster.local") ||
      hostname === "kubernetes.default" ||
      hostname === "kubernetes.default.svc" ||
      hostname.endsWith(".compute.internal")
    ) {
      return true;
    }

    // Check for decimal IP (e.g. 2130706433 = 127.0.0.1)
    const decimalIp = decimalToIPv4(hostname);
    if (decimalIp) {
      return isPrivateIPv4(decimalIp);
    }

    // Check for IPv4-mapped IPv6 (::ffff:x.x.x.x)
    const mappedIpv4 = extractIPv4Mapped(hostname);
    if (mappedIpv4) {
      return isPrivateIPv4(mappedIpv4);
    }

    // Direct IPv4
    if (isIP(hostname) === 4) {
      return isPrivateIPv4(hostname);
    }

    // IPv6
    if (isIP(hostname) === 6) {
      return isPrivateIPv6(hostname);
    }

    // Octal detection: hostnames with leading zeros in octets (e.g. 0177.0.0.1)
    if (/^[0-9.]+$/.test(hostname) && hostname.split(".").some((p) => p.length > 1 && p.startsWith("0"))) {
      return true; // Block octal IP representations
    }

    return false;
  } catch {
    return true; // Malformed URL — block
  }
}
