import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright конфіг для Vibe Studio E2E тестів.
 *
 * Authenticated тести використовують storageState з файлу
 * tests/auth/owner.json — його треба згенерувати один раз командою:
 *
 *   npx playwright codegen \
 *     --save-storage=tests/auth/owner.json \
 *     https://vibe-studio.example.com
 *   # Залогінитись через Google/GitHub → закрити браузер
 *
 * globalSetup (tests/nightly/global-setup.ts) намагається auto-login через
 * OWNER_EMAIL + OWNER_PASSWORD env vars (credentials provider), або reuse
 * існуючого owner.json, або виводить інструкцію.
 *
 * Детальніше: https://playwright.dev/docs/auth
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/nightly/global-setup",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    // SAFETY: дефолт — localhost. Prod (https://vibe-studio.example.com) таргетимо ЛИШЕ
    // через явний BASE_URL env (CI) або read-only project "prod-smoke" нижче.
    // E2E з click/submit під owner storageState НЕ повинні мутувати prod БД
    // за замовчуванням (rev20260512-029 — той самий фікс для JF).
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    // Не слідкуємо за редиректами автоматично в API тестах
    ignoreHTTPSErrors: false,
  },

  projects: [
    // --- Auth setup (запускається перед authenticated тестами) ---
    {
      name: "setup",
      testMatch: "**/auth/setup.ts",
    },

    // --- Public сторінки (без auth) ---
    {
      name: "public",
      testMatch: "**/nightly/vs-e2e.spec.ts",
      grep: /@public/,
      use: { ...devices["Desktop Chrome"] },
    },

    // --- Authenticated тести (OWNER) ---
    {
      name: "authenticated",
      testMatch: "**/nightly/vs-e2e.spec.ts",
      grep: /@auth/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/auth/owner.json",
      },
    },

    // --- API health тести (без браузера) ---
    {
      name: "api",
      testMatch: "**/nightly/vs-e2e.spec.ts",
      grep: /@api/,
      use: { ...devices["Desktop Chrome"] },
    },

    // --- Mobile public тести (iPhone SE + Pixel 5, без auth) ---
    {
      name: "mobile-public",
      testMatch: "**/nightly/vs-mobile.spec.ts",
      grep: /@mobile-public/,
    },

    // --- Mobile authenticated тести (iPhone SE + Pixel 5, OWNER) ---
    {
      name: "mobile-auth",
      testMatch: "**/nightly/vs-mobile.spec.ts",
      grep: /@mobile-auth/,
      dependencies: ["setup"],
    },

    // --- Prod nightly smoke (@smoke) — READ-ONLY, без auth/storageState ---
    // Єдиний project якому дозволено таргетити prod без явного BASE_URL.
    // Тільки GET-перевірки (homepage 200, /api/health) — жодних мутацій.
    // Запуск: npx playwright test --project=prod-smoke
    {
      name: "prod-smoke",
      testMatch: "**/smoke.spec.ts",
      grep: /@smoke/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.BASE_URL ?? "https://vibe-studio.example.com",
      },
    },
  ],
});
