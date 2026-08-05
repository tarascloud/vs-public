/**
 * Vibe Studio — smoke test suite (wave 1)
 *
 * Runs as part of `e2e-smoke.yml` CI workflow on push to main (app/**).
 * Tags: @smoke — select with: npx playwright test --grep "@smoke"
 *
 * Wave 2 TODO: add PD/JF/SH/KO smoke CI (separate task).
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.TEST_BASE_URL ?? "https://vibe-studio.example.com";

test("@smoke homepage returns 200 and has page title", async ({ page }) => {
  const response = await page.goto(BASE_URL);
  expect(response?.status()).toBe(200);

  const title = await page.title();
  expect(title).toBeTruthy();
  expect(title).not.toBe("404");
  expect(title.toLowerCase()).not.toContain("not found");
});

test("@smoke /api/health returns ok", async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/health`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});
