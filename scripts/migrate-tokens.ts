/**
 * One-time migration script: replace CUID-based shareToken/manageToken
 * with cryptographically secure tokens (base64url, 32 bytes).
 *
 * Usage:
 *   npx tsx scripts/migrate-tokens.ts [--dry-run]
 *
 * Safety:
 *   - Processes in batches of 500 to avoid memory pressure
 *   - Uses individual updates (not bulk) to preserve unique constraints
 *   - Dry-run mode shows what would change without writing
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

// CUID pattern: 25-char alphanumeric starting with 'c'
const CUID_RE = /^c[a-z0-9]{24}$/;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("=== DRY RUN MODE — no changes will be written ===\n");

  // --- Migrate MeetingType.shareToken ---
  console.log("Migrating MeetingType.shareToken...");
  let shareCount = 0;
  let cursor: number | undefined;
  const BATCH = 500;

  while (true) {
    const types = await prisma.meetingType.findMany({
      select: { id: true, shareToken: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { where: { id: { gt: cursor } } } : {}),
    });

    if (types.length === 0) break;
    cursor = types[types.length - 1].id;

    for (const t of types) {
      if (CUID_RE.test(t.shareToken)) {
        const newToken = generateSecureToken();
        if (dryRun) {
          console.log(`  [dry] MeetingType ${t.id}: ${t.shareToken} -> ${newToken}`);
        } else {
          await prisma.meetingType.update({
            where: { id: t.id },
            data: { shareToken: newToken },
          });
        }
        shareCount++;
      }
    }

    if (types.length < BATCH) break;
  }
  console.log(`  ${dryRun ? "Would update" : "Updated"} ${shareCount} shareTokens\n`);

  // --- Migrate Meeting.manageToken ---
  console.log("Migrating Meeting.manageToken...");
  let manageCount = 0;
  let meetingCursor: string | undefined;

  while (true) {
    const meetings = await prisma.meeting.findMany({
      select: { id: true, manageToken: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(meetingCursor ? { where: { id: { gt: meetingCursor } } } : {}),
    });

    if (meetings.length === 0) break;
    meetingCursor = meetings[meetings.length - 1].id;

    for (const m of meetings) {
      if (CUID_RE.test(m.manageToken)) {
        const newToken = generateSecureToken();
        if (dryRun) {
          console.log(`  [dry] Meeting ${m.id}: ${m.manageToken} -> ${newToken}`);
        } else {
          await prisma.meeting.update({
            where: { id: m.id },
            data: { manageToken: newToken },
          });
        }
        manageCount++;
      }
    }

    if (meetings.length < BATCH) break;
  }
  console.log(`  ${dryRun ? "Would update" : "Updated"} ${manageCount} manageTokens\n`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
