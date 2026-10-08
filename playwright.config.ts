import { defineConfig, devices } from '@playwright/test'

// The stub gateway runs the private-beta door in e2e too, so the header injection is
// exercised by every journey and not only by the gate spec.
export const STUB_PASSWORD = 'tallow-candle'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // the stub gateway holds the anonymous allowance in one process
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // Every journey but the gate one starts past the door, like a returning beta tester.
    // `e2e/gate.spec.ts` clears this to meet the panel on a first visit.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [{ name: 'council:key', value: STUB_PASSWORD }],
        },
        {
          // A second build with the admin escape hatch baked in (see e2e/admin-bar.spec.ts);
          // kept off the main build so the fold/gate/council journeys never see an admin.
          origin: 'http://localhost:4174',
          localStorage: [{ name: 'council:key', value: STUB_PASSWORD }],
        },
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/stub-gateway.mjs',
      url: 'http://localhost:8787/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      // Slow enough that a mid-debate screenshot is actually mid-debate.
      env: { STUB_TURN_DELAY_MS: '300', STUB_PASSWORD },
    },
    {
      command: 'npm run build && npm run preview -- --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { VITE_GATEWAY_URL: 'http://localhost:8787' },
    },
    {
      // VITE_E2E_ADMIN only ever lives here — never in a real deploy env — so admin.ts's
      // escape hatch stays a no-op in production. Separate outDir/port so this build
      // never leaks into the plain one above (e2e/fold.spec.ts needs the bar absent).
      command: 'vite build --outDir dist-e2e-admin && vite preview --outDir dist-e2e-admin --port 4174',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { VITE_GATEWAY_URL: 'http://localhost:8787', VITE_E2E_ADMIN: '1' },
    },
  ],
})
