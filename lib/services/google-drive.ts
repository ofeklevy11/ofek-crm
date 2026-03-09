import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../env";
import { encrypt, decrypt } from "./encryption";
import { prisma } from "../prisma";
import { createLogger } from "../logger";

const log = createLogger("GoogleDrive");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const SCOPE =
  "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email";
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function getRedirectUri(): string {
  const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl}/api/integrations/google/drive/callback`;
}

function getEncryptionKey(): string {
  const key = env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be a 64-character hex string",
    );
  }
  return key;
}

function hmacSign(data: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(data).digest("hex");
}

// ─── OAuth State ───

export function buildOAuthState(userId: number, companyId: number): string {
  const timestamp = Date.now().toString();
  const payload = `${userId}:${companyId}:${timestamp}`;
  const signature = hmacSign(payload);
  return `${payload}:${signature}`;
}

export function validateOAuthState(
  state: string,
): { userId: number; companyId: number } | null {
  const parts = state.split(":");
  if (parts.length !== 4) return null;

  const [userIdStr, companyIdStr, timestampStr, signature] = parts;
  const payload = `${userIdStr}:${companyIdStr}:${timestampStr}`;

  const expectedSig = hmacSign(payload);
  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSig, "hex");

  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  const timestamp = parseInt(timestampStr, 10);
  if (Date.now() - timestamp > STATE_MAX_AGE_MS) return null;

  return {
    userId: parseInt(userIdStr, 10),
    companyId: parseInt(companyIdStr, 10),
  };
}

// ─── OAuth URL ───

export function buildAuthUrl(userId: number, companyId: number): string {
  const state = buildOAuthState(userId, companyId);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ─── Token Exchange ───

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    log.error("Token exchange failed", { status: res.status, body: text });
    throw new Error("Failed to exchange authorization code");
  }

  return res.json();
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    log.error("Token refresh failed", { status: res.status, body: text });
    throw new Error("Failed to refresh access token");
  }

  return res.json();
}

// ─── Google User Info ───

export async function getGoogleUserInfo(
  accessToken: string,
): Promise<{ email: string }> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch Google user info");
  }

  const data = await res.json();
  return { email: data.email };
}

// ─── Drive API ───

export interface DriveFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  iconLink?: string;
}

export async function listDriveFolders(
  accessToken: string,
  parentId: string = "root",
): Promise<DriveFolder[]> {
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,modifiedTime)",
    pageSize: "100",
    orderBy: "name",
  });

  const res = await fetch(`${GOOGLE_DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    log.error("Failed to list Drive folders", {
      status: res.status,
      body: text,
    });
    throw new Error("Failed to list Drive folders");
  }

  const data = await res.json();
  return data.files || [];
}

export async function listDriveFiles(
  accessToken: string,
  folderId: string,
  pageToken?: string,
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const q = `'${folderId}' in parents and trashed=false`;
  const params = new URLSearchParams({
    q,
    fields:
      "files(id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink,iconLink),nextPageToken",
    pageSize: "50",
    orderBy: "folder,name",
  });
  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const res = await fetch(`${GOOGLE_DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    log.error("Failed to list Drive files", {
      status: res.status,
      body: text,
    });
    throw new Error("Failed to list Drive files");
  }

  const data = await res.json();
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken,
  };
}

export async function getDriveFileMeta(
  accessToken: string,
  fileId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,modifiedTime,webViewLink",
  });

  const res = await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error("Failed to get Drive file metadata");
  }

  return res.json();
}

const GOOGLE_DOCS_EXPORT_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "application/pdf",
  "application/vnd.google-apps.spreadsheet":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.google-apps.presentation": "application/pdf",
  "application/vnd.google-apps.drawing": "application/pdf",
};

const GOOGLE_DOCS_EXTENSIONS: Record<string, string> = {
  "application/vnd.google-apps.document": ".pdf",
  "application/vnd.google-apps.spreadsheet": ".xlsx",
  "application/vnd.google-apps.presentation": ".pdf",
  "application/vnd.google-apps.drawing": ".pdf",
};

export function isGoogleDocsType(mimeType: string): boolean {
  return mimeType in GOOGLE_DOCS_EXPORT_TYPES;
}

export function getExportMimeType(mimeType: string): string | null {
  return GOOGLE_DOCS_EXPORT_TYPES[mimeType] || null;
}

export function getExportExtension(mimeType: string): string {
  return GOOGLE_DOCS_EXTENSIONS[mimeType] || "";
}

export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  mimeType: string,
): Promise<Response> {
  const exportMime = getExportMimeType(mimeType);

  if (exportMime) {
    // Google Docs types need to be exported
    return fetch(
      `${GOOGLE_DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  // Regular file download
  return fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// Verify a folder is reachable from one of the selected roots
export async function verifyFolderAccess(
  accessToken: string,
  folderId: string,
  selectedFolderIds: string[],
): Promise<boolean> {
  if (selectedFolderIds.includes(folderId)) return true;

  // Walk up the parent chain
  let currentId = folderId;
  const maxDepth = 20;
  for (let i = 0; i < maxDepth; i++) {
    const params = new URLSearchParams({ fields: "id,parents" });
    const res = await fetch(
      `${GOOGLE_DRIVE_API}/files/${currentId}?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) return false;

    const data = await res.json();
    const parents: string[] = data.parents || [];
    if (parents.length === 0) return false;

    const parentId = parents[0];
    if (selectedFolderIds.includes(parentId)) return true;
    currentId = parentId;
  }

  return false;
}

// ─── Token Revocation ───

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch (err) {
    log.error("Token revocation failed (non-critical)", {
      error: String(err),
    });
  }
}

// ─── Encrypt / Decrypt Tokens ───

export function encryptToken(token: string) {
  return encrypt(token, getEncryptionKey());
}

export function decryptToken(enc: string, iv: string, tag: string): string {
  return decrypt({ ciphertext: enc, iv, authTag: tag }, getEncryptionKey());
}

// ─── Get Valid Access Token (auto-refresh) ───

export class TokenRevokedError extends Error {
  constructor() {
    super("Google Drive refresh token has been revoked");
    this.name = "TokenRevokedError";
  }
}

export async function getValidAccessToken(
  connection: {
    id: number;
    accessTokenEnc: string;
    accessTokenIv: string;
    accessTokenTag: string;
    refreshTokenEnc: string;
    refreshTokenIv: string;
    refreshTokenTag: string;
    tokenExpiresAt: Date;
  },
): Promise<string> {
  // If token is still valid (with 5-min buffer), return it
  if (connection.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return decryptToken(
      connection.accessTokenEnc,
      connection.accessTokenIv,
      connection.accessTokenTag,
    );
  }

  // Refresh the token
  const refreshToken = decryptToken(
    connection.refreshTokenEnc,
    connection.refreshTokenIv,
    connection.refreshTokenTag,
  );

  let refreshed;
  try {
    refreshed = await refreshAccessToken(refreshToken);
  } catch {
    log.warn("Refresh token appears revoked, deactivating connection", {
      connectionId: connection.id,
    });
    await prisma.googleDriveConnection.update({
      where: { id: connection.id },
      data: { isActive: false },
    });
    throw new TokenRevokedError();
  }

  const encAccess = encryptToken(refreshed.access_token);

  await prisma.googleDriveConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encAccess.ciphertext,
      accessTokenIv: encAccess.iv,
      accessTokenTag: encAccess.authTag,
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  });

  return refreshed.access_token;
}
