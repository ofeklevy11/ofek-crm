import { test as setup, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const AUTH_DIR = path.join(__dirname, ".auth");

setup("verify auth storage states exist", async () => {
  // globalSetup (auth-setup.ts) already seeded DB and wrote storage files.
  // This test just verifies they were created successfully.
  expect(fs.existsSync(path.join(AUTH_DIR, "admin.json"))).toBe(true);
  expect(fs.existsSync(path.join(AUTH_DIR, "basic.json"))).toBe(true);
  expect(fs.existsSync(path.join(AUTH_DIR, "no-tasks.json"))).toBe(true);
});
