#!/usr/bin/env node

/**
 * This script helps identify files that need to be updated for multi-tenancy support
 * It searches for Prisma queries that might need companyId filtering
 */

const fs = require("fs");
const path = require("path");

const MODELS_REQUIRING_COMPANY_ID = [
  "user",
  "message",
  "group",
  "automationRule",
  "notification",
  "tableMeta",
  "tableCategory",
  "record",
  "task",
  "calendarEvent",
  "client",
  "analyticsView",
  "viewFolder",
];

const PRISMA_OPERATIONS = [
  "findMany",
  "findUnique",
  "findFirst",
  "create",
  "createMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
];

function searchFiles(dir, results = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and .next
      if (file === "node_modules" || file === ".next" || file === ".git") {
        continue;
      }
      searchFiles(filePath, results);
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      const content = fs.readFileSync(filePath, "utf8");

      // Check if file uses prisma
      if (content.includes("prisma.")) {
        const issues = [];

        // Check each model
        for (const model of MODELS_REQUIRING_COMPANY_ID) {
          for (const op of PRISMA_OPERATIONS) {
            const regex = new RegExp(`prisma\\.${model}\\.${op}`, "g");
            const matches = content.match(regex);

            if (matches) {
              // Check if companyId is mentioned nearby (simple heuristic)
              const hasCompanyId = content.includes("companyId");

              if (!hasCompanyId) {
                issues.push(`${model}.${op} (possibly missing companyId)`);
              }
            }
          }
        }

        if (issues.length > 0) {
          results.push({
            file: filePath,
            issues: issues,
          });
        }
      }
    }
  }

  return results;
}

console.log("🔍 Searching for files that need multi-tenancy updates...\n");

const projectRoot = path.join(__dirname, "..");
const results = searchFiles(path.join(projectRoot, "app"));

if (results.length === 0) {
  console.log(
    "✅ No files found that obviously need updates (or all already updated)"
  );
} else {
  console.log(`⚠️  Found ${results.length} files that may need attention:\n`);

  results.forEach(({ file, issues }) => {
    console.log(`📄 ${file}`);
    issues.forEach((issue) => {
      console.log(`   - ${issue}`);
    });
    console.log("");
  });

  console.log(
    "\n📝 Please review these files and add companyId filtering where appropriate."
  );
  console.log("See MULTI_TENANCY_GUIDE.md for examples.\n");
}
