import { defineConfig } from '@playwright/test'
import { releaseBrowserProjects } from './playwright.config'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: releaseBrowserProjects,
})
