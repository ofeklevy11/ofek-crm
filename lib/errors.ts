/**
 * Client-side error sanitizer.
 * Maps known English error patterns to Hebrew user-friendly messages.
 * Passes through already-Hebrew messages untouched.
 */

export const GENERIC_ERROR = "אירעה שגיאה. אנא נסו שוב מאוחר יותר.";

const HEBREW_RE = /^[\u0590-\u05FF]/;

const ERROR_MAP: [RegExp, string][] = [
  // Auth / permissions
  [/unauthorized|not authorized|access denied|forbidden/i, "אין לך הרשאה לבצע פעולה זו"],
  [/invalid credentials|wrong password|incorrect password/i, "פרטי ההתחברות שגויים"],
  [/session expired|token expired|jwt expired/i, "פג תוקף ההתחברות, אנא התחברו מחדש"],
  [/not authenticated|unauthenticated/i, "יש להתחבר למערכת כדי לבצע פעולה זו"],

  // Rate limiting
  [/rate limit|too many requests/i, "בוצעו יותר מדי פניות. אנא נסו שוב בעוד 2 דקות"],

  // Validation
  [/must be a string/i, "הערך שהוזן אינו תקין"],
  [/must be a non-negative number|must be a positive/i, "הערך חייב להיות מספר חיובי"],
  [/characters or less|too long/i, "הטקסט ארוך מדי"],
  [/is required|cannot be empty|cannot be blank/i, "יש למלא את כל שדות החובה"],
  [/invalid email|not a valid email/i, "כתובת האימייל אינה תקינה"],
  [/invalid url|not a valid url/i, "כתובת ה-URL אינה תקינה"],
  [/must use https/i, "הכתובת חייבת להיות מאובטחת (HTTPS)"],
  [/invalid json|contains invalid json/i, "הנתונים שהוזנו אינם תקינים"],
  [/exceeds maximum size/i, "הנתונים חורגים מהגודל המרבי המותר"],
  [/exceeds maximum nesting/i, "מבנה הנתונים מורכב מדי"],
  [/private.*address|internal.*address/i, "הכתובת שהוזנה אינה חוקית"],

  // CRUD operations
  [/not found/i, "הפריט המבוקש לא נמצא"],
  [/duplicate entry|already exists|unique constraint/i, "פריט עם פרטים אלו כבר קיים במערכת"],
  [/referenced record|related records|cannot delete.*related|has related/i, "לא ניתן למחוק פריט זה כיוון שקיימים פריטים הקשורים אליו"],
  [/failed to (create|save|add)/i, "שגיאה ביצירת הפריט. אנא נסו שוב"],
  [/failed to (update|edit|modify)/i, "שגיאה בעדכון הפריט. אנא נסו שוב"],
  [/failed to (delete|remove)/i, "שגיאה במחיקת הפריט. אנא נסו שוב"],
  [/failed to (fetch|load|get|retrieve)/i, "שגיאה בטעינת הנתונים. אנא נסו שוב"],
  [/operation failed/i, "הפעולה נכשלה. אנא נסו שוב"],

  // Limits
  [/limit reached|maximum.*reached|exceeded.*limit/i, "הגעתם למגבלה המרבית"],
  [/quota exceeded/i, "חרגתם מהמכסה המותרת"],

  // Network
  [/network error|fetch failed|failed to fetch/i, "שגיאת תקשורת. אנא בדקו את החיבור לאינטרנט"],
  [/timeout|timed out/i, "הפעולה ארכה זמן רב מדי. אנא נסו שוב"],
  [/server error|internal server/i, "שגיאת שרת. אנא נסו שוב מאוחר יותר"],

  // File upload
  [/file.*too large|too big|exceeds.*size/i, "הקובץ גדול מדי"],
  [/invalid file|unsupported file|file type/i, "סוג הקובץ אינו נתמך"],
  [/upload failed|upload error/i, "שגיאה בהעלאת הקובץ. אנא נסו שוב"],
];

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

/**
 * Convert any error to a user-friendly Hebrew message.
 * Logs the technical details to console.error.
 */
export function getUserFriendlyError(error: unknown): string {
  const raw = extractMessage(error);

  // Log full technical error for debugging
  console.error("[Error]", error);

  if (!raw) return GENERIC_ERROR;

  // Already Hebrew — pass through
  if (HEBREW_RE.test(raw)) return raw;

  // Try to match known patterns
  for (const [pattern, hebrewMsg] of ERROR_MAP) {
    if (pattern.test(raw)) return hebrewMsg;
  }

  return GENERIC_ERROR;
}

/**
 * Sanitize a result.error string from server action responses.
 * If the error is already Hebrew, returns it as-is.
 * Otherwise maps through the error map or returns a fallback.
 */
export function getFriendlyResultError(
  resultError: string | null | undefined,
  fallback?: string,
): string {
  if (!resultError) return fallback || GENERIC_ERROR;

  // Already Hebrew — pass through
  if (HEBREW_RE.test(resultError)) return resultError;

  // Try to match known patterns
  for (const [pattern, hebrewMsg] of ERROR_MAP) {
    if (pattern.test(resultError)) return hebrewMsg;
  }

  // Log the raw error for debugging
  console.error("[ResultError]", resultError);

  return fallback || GENERIC_ERROR;
}
