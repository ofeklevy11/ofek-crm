import fs from "node:fs";
import path from "node:path";

const TARGET_DIR = path.join(process.cwd(), "app");
const TARGET_FILENAMES = ["page.tsx", "layout.tsx", "route.ts"];

async function scanAndApply(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanAndApply(fullPath);
    } else if (entry.isFile()) {
      if (TARGET_FILENAMES.includes(entry.name)) {
        processFile(fullPath);
      }
    }
  }
}

function processFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf-8");

  // Exclusion checks
  if (
    content.includes("export const runtime") ||
    content.includes("export const runtime = 'edge'")
  ) {
    console.log(`Skipping ${filePath}: runtime already defined`);
    return;
  }

  // Check for forbidden Edge APIs
  // Using regex for slightly better matching handling, though simple includes is likely sufficient per user request
  if (
    content.includes("request.geo") ||
    content.includes("request.ip") ||
    content.includes("request.cf")
  ) {
    console.log(`Skipping ${filePath}: contains forbidden Edge APIs`);
    return;
  }

  // Insert logic
  const lines = content.split("\n");
  let insertIndex = 0;

  // Try to find the last import to insert after it
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line.startsWith("import ") ||
      line.startsWith("import type") ||
      line.match(/^import\s+.*from/)
    ) {
      lastImportIndex = i;
    }
  }

  if (lastImportIndex !== -1) {
    insertIndex = lastImportIndex + 1;
  }

  // Ensure we don't break "use client" if it's at the top.
  // "use client" usually is the very first line. Imports follow.
  // If we insert after imports, we are safe.

  const toInsert = 'export const runtime = "nodejs";';

  // Insert with a blank line for readability
  const newLines = [
    ...lines.slice(0, insertIndex),
    "",
    toInsert,
    ...lines.slice(insertIndex),
  ];

  // Join and write
  // Remove multiple empty lines if checked, but simple join is safer to avoid deleting user formatting
  const finalContent = newLines.join("\n");

  fs.writeFileSync(filePath, finalContent, "utf-8");
  console.log(`Updated ${filePath}`);
}

console.log("Starting runtime update...");
scanAndApply(TARGET_DIR);
console.log("Finished.");
