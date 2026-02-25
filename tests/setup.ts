/**
 * Vitest global setup file.
 * Referenced by vitest.config.ts → setupFiles.
 *
 * Add test-wide mocks, polyfills, or global beforeAll/afterAll hooks here.
 */

// Ensure test environment variables are loaded (dotenv is handled by vitest.config.ts)

// Silence noisy loggers during tests
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
