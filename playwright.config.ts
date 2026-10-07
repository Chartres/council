import { defineConfig, devices } from '@playwright/test'

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
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/stub-gateway.mjs',
      url: 'http://localhost:8787/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run build && npm run preview -- --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { VITE_GATEWAY_URL: 'http://localhost:8787' },
    },
  ],
})
