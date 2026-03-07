import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import { createLogger } from "@/lib/logger";

const log = createLogger("SecurityAudit");

// Security event action constants — prefixed for easy DB querying
export const SEC_LOGIN_SUCCESS = "SEC_LOGIN_SUCCESS";
export const SEC_LOGIN_FAILED = "SEC_LOGIN_FAILED";
export const SEC_LOGOUT = "SEC_LOGOUT";
export const SEC_REGISTER = "SEC_REGISTER";
export const SEC_PASSWORD_CHANGED = "SEC_PASSWORD_CHANGED";
export const SEC_ROLE_CHANGED = "SEC_ROLE_CHANGED";
export const SEC_PERMISSIONS_CHANGED = "SEC_PERMISSIONS_CHANGED";
export const SEC_API_KEY_CREATED = "SEC_API_KEY_CREATED";
export const SEC_API_KEY_DELETED = "SEC_API_KEY_DELETED";
export const SEC_AUTH_FAILED = "SEC_AUTH_FAILED";
export const SEC_TABLE_DELETED = "SEC_TABLE_DELETED";
export const SEC_VIEW_DELETED = "SEC_VIEW_DELETED";
export const SEC_ANALYTICS_VIEW_DELETED = "SEC_ANALYTICS_VIEW_DELETED";
export const SEC_WORKFLOW_DELETED = "SEC_WORKFLOW_DELETED";
export const SEC_BULK_DELETE = "SEC_BULK_DELETE";
export const SEC_PASSWORD_RESET = "SEC_PASSWORD_RESET";
export const SEC_EMAIL_CHANGED = "SEC_EMAIL_CHANGED";
export const SEC_ACCOUNT_DELETED = "SEC_ACCOUNT_DELETED";

interface SecurityEventParams {
  action: string;
  companyId: number;
  userId?: number | null;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * Fire-and-forget security event logger.
 * Writes to AuditLog with SEC_ prefix. Never throws or blocks the caller.
 */
export function logSecurityEvent(params: SecurityEventParams) {
  const { action, companyId, userId, ip, userAgent, details } = params;

  const diffJson: Record<string, unknown> = {};
  if (ip) diffJson.ip = ip;
  if (userAgent) diffJson.userAgent = userAgent;
  if (details) Object.assign(diffJson, details);

  prisma.auditLog
    .create({
      data: {
        action,
        companyId,
        userId: userId ?? null,
        recordId: null,
        diffJson: Object.keys(diffJson).length > 0 ? diffJson : undefined,
      },
    })
    .catch((err) => {
      log.error("Failed to write security event", { action, companyId, error: String(err) });
    });
}

/** Extract IP and User-Agent from an incoming Request. */
export function extractRequestMeta(req: Request) {
  return {
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
}
