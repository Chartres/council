import { devices } from '@playwright/test'
import base from './playwright.config'

// Not part of the gate: the voice capture journeys in Firefox and WebKit, the engines behind
// Firefox on Android and every browser on an iPhone (Pavol dictates in Firefox on his phone).
//   npx playwright install firefox webkit
//   CI=1 npx playwright test -c playwright.engines.config.ts
export default {
  ...base,
  testMatch: /voice-capture\.spec\.ts/,
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
}
