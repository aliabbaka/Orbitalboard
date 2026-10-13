import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5010', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: '.venv/bin/python -m backend.app', url: 'http://127.0.0.1:5010/api/health', env: { PORT: '5010', GROQ_API_KEY: '', ORBITALBOARD_QUIET: '1', BOARD_DB_PATH: 'test-results/browser-boards.sqlite3' }, reuseExistingServer: false, timeout: 20000 },
});
