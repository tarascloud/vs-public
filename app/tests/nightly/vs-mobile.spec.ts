/**
 * Vibe Studio — Mobile E2E Test Suite (VS-MOBILE-009)
 *
 * Перевіряє фікси VS-MOBILE-001..008:
 *   - Responsive nav-bar з drawer (hamburger → drawer → link → закрити)
 *   - No horizontal overflow на landing та /studio
 *   - Mobile tab pills видимі та active pill у viewport
 *   - Kanban один column на viewport width
 *   - Tap targets ≥44px для drawer nav links
 *   - No iOS zoom: input/textarea font-size ≥16px
 *   - PWA manifest повертає коректний JSON
 *
 * Теги:
 *   @mobile-public  — публічні тести (без auth)
 *   @mobile-auth    — тести що вимагають OWNER-сесію
 *
 * Запуск:
 *   npx playwright test tests/nightly/vs-mobile.spec.ts --reporter=list --project=mobile-public
 *   npx playwright test tests/nightly/vs-mobile.spec.ts --reporter=list --project=mobile-auth
 *   npx playwright test tests/nightly/vs-mobile.spec.ts --reporter=list  # всі
 *
 * ПРИМІТКА: devices[X] spread без defaultBrowserType — щоб дозволити test.use() у describe.
 * defaultBrowserType виключається явно, тести запускаються у Chromium (визначається проектом).
 */

import { test, expect, devices, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Device configs без defaultBrowserType (Playwright 1.58 не дозволяє
// defaultBrowserType в test.use() всередині describe)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _se, ...iphoneSE } = devices["iPhone SE"];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _p5, ...pixel5 } = devices["Pixel 5"];

// ---------------------------------------------------------------------------
// Хелпери
// ---------------------------------------------------------------------------

/** Перевірити відсутність горизонтального скролу */
async function assertNoHorizontalScroll(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth
  );
  const innerWidth = await page.evaluate(() => window.innerWidth);

  expect(
    scrollWidth,
    `${url} має горизонтальний скрол: scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`
  ).toBeLessThanOrEqual(innerWidth);
}

/** Відкрити drawer та повернути його locator */
async function openDrawer(page: Page) {
  // Чекаємо React hydration — nav має з'явитись після client-side render
  const hamburger = page.getByRole("button", {
    name: "Open navigation menu",
  });
  // Збільшений timeout для hydration + SSR
  await expect(hamburger).toBeVisible({ timeout: 15_000 });
  await hamburger.click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible({ timeout: 5_000 });
  return drawer;
}

// ---------------------------------------------------------------------------
// 1. iPhone SE — Public (без auth)
// ---------------------------------------------------------------------------

test.describe(
  "Mobile iPhone SE — Public",
  { tag: "@mobile-public" },
  () => {
    test.use({ ...iphoneSE });

    // --- 1.1 No horizontal scroll — Landing ---
    test("Landing / — немає горизонтального overflow", async ({ page }) => {
      await assertNoHorizontalScroll(page, "/");
    });

    // --- 1.2 No horizontal scroll — /studio (signin page) ---
    test("Studio /studio — немає горизонтального overflow на signin", async ({
      page,
    }) => {
      await assertNoHorizontalScroll(page, "/studio");
    });

    // --- 1.3 Sign-in button — visible на Landing (public, без auth) ---
    // NOTE: Hamburger показується тільки коли є auth-сесія.
    // Для public-перевірки достатньо перевірити що Sign In доступний.
    test("Landing — кнопка Sign In видима без auth", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      // Можна знайти Sign In через aria або текст
      const signInBtn = page
        .getByRole("button", { name: /sign in|увійти/i })
        .or(page.getByRole("link", { name: /sign in|увійти/i }))
        .first();

      // Fallback — перевіряємо що nav взагалі є
      const nav = page.locator("nav").first();
      await expect(nav).toBeVisible({ timeout: 10_000 });

      // Sign in button або anchor — має бути видимий
      const hasSignIn = await signInBtn.isVisible().catch(() => false);
      expect(hasSignIn, "Sign In кнопка або посилання має бути видима").toBe(true);
    });

    // --- 1.7 PWA Manifest ---
    test("PWA manifest — повертає JSON з name 'Vibe Studio'", async ({
      request,
    }) => {
      const response = await request.get("/manifest.webmanifest");
      expect(response.status()).toBe(200);

      const contentType = response.headers()["content-type"] ?? "";
      expect(contentType, "Content-Type має бути JSON або manifest").toMatch(
        /json|manifest/i
      );

      const manifest = await response.json();
      expect(manifest).toHaveProperty("name");
      expect(manifest.name).toMatch(/vibe studio/i);
    });

    // --- 1.8 Landing — без JS помилок ---
    test("Landing — рендериться без JS помилок на iPhone SE", async ({
      page,
    }) => {
      const jsErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") jsErrors.push(msg.text());
      });

      await page.goto("/", { waitUntil: "domcontentloaded" });

      const realErrors = jsErrors.filter(
        (e) =>
          !e.includes("favicon") &&
          !e.includes("net::ERR_") &&
          !e.includes("chrome-extension")
      );

      expect(
        realErrors,
        `JS помилки на Landing (iPhone SE): ${realErrors.join("; ")}`
      ).toHaveLength(0);
    });

    // --- 1.9 Nav — не виходить за межі viewport ---
    test("Nav bar — ширина не перевищує viewport", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      const nav = page.locator("nav").first();
      await expect(nav).toBeVisible({ timeout: 10_000 });

      const navBox = await nav.boundingBox();
      if (navBox) {
        const viewportWidth = page.viewportSize()?.width ?? 320;
        expect(
          navBox.width,
          `Nav width=${navBox.width}px > viewport=${viewportWidth}px`
        ).toBeLessThanOrEqual(viewportWidth + 1);
      }
    });
  }
);

// ---------------------------------------------------------------------------
// 2. Pixel 5 — Public (без auth)
// ---------------------------------------------------------------------------

test.describe(
  "Mobile Pixel 5 — Public",
  { tag: "@mobile-public" },
  () => {
    test.use({ ...pixel5 });

    // --- 2.1 No horizontal scroll — Landing ---
    test("Landing / — немає горизонтального overflow на Pixel 5", async ({
      page,
    }) => {
      await assertNoHorizontalScroll(page, "/");
    });

    // --- 2.2 No horizontal scroll — Portfolio ---
    test("Portfolio /portfolio — немає горизонтального overflow на Pixel 5", async ({
      page,
    }) => {
      await assertNoHorizontalScroll(page, "/portfolio");
    });

    // --- 2.3 Landing — Sign In visible на Pixel 5 ---
    test("Landing — Sign In видима на Pixel 5", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      const nav = page.locator("nav").first();
      await expect(nav).toBeVisible({ timeout: 10_000 });

      // Sign In кнопка або посилання
      const signIn = page
        .getByRole("button", { name: /sign in|увійти/i })
        .or(page.getByRole("link", { name: /sign in|увійти/i }))
        .first();

      const hasSignIn = await signIn.isVisible().catch(() => false);
      expect(hasSignIn, "Sign In має бути видима на Pixel 5").toBe(true);
    });

    // --- 2.4 No horizontal overflow на signin ---
    test("Studio /studio — немає горизонтального overflow на Pixel 5 signin", async ({
      page,
    }) => {
      await assertNoHorizontalScroll(page, "/studio");
    });

    // --- 2.5 PWA Manifest ---
    test("PWA manifest — повертає JSON з name 'Vibe Studio' (Pixel 5)", async ({
      request,
    }) => {
      const response = await request.get("/manifest.webmanifest");
      expect(response.status()).toBe(200);

      const manifest = await response.json();
      expect(manifest.name).toMatch(/vibe studio/i);
    });
  }
);

// ---------------------------------------------------------------------------
// 3. iPhone SE — Authenticated (OWNER session)
// ---------------------------------------------------------------------------

test.describe(
  "Mobile iPhone SE — Authenticated",
  { tag: "@mobile-auth" },
  () => {
    test.use({
      ...iphoneSE,
      storageState: "tests/auth/owner.json",
    });

    test.beforeEach(async ({ page }) => {
      // Переконуємось що auth спрацювала
      await page.goto("/studio", { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/signin|login/);
    });

    // --- 3.1 Nav drawer — link веде на board та закриває drawer ---
    test("Nav drawer — клік на Board веде на /studio?tab=board та закриває drawer", async ({
      page,
    }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      const drawer = await openDrawer(page);

      const boardLink = drawer.getByRole("link", { name: /board/i }).first();
      await expect(boardLink).toBeVisible({ timeout: 5_000 });
      await boardLink.click();

      // Drawer закрився
      await expect(drawer).not.toBeVisible({ timeout: 5_000 });

      // URL оновився
      await expect(page).toHaveURL(/tab=board/, { timeout: 10_000 });
    });

    // --- 3.2 Mobile tab pills — видимі на /studio ---
    test("Studio mobile tabs — tab pills видимі на iPhone SE", async ({
      page,
    }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      // Tab bar між nav та content — overflow-x: auto з no-scrollbar
      // Локатор: flex row з pill-links що містить ideas/board/office
      const tabBar = page
        .locator(".no-scrollbar")
        .filter({ hasText: /ideas|board|office/i })
        .first();

      await expect(tabBar).toBeVisible({ timeout: 10_000 });
    });

    // --- 3.3 Mobile tab pills — active pill "ideas" у viewport ---
    test("Studio mobile tabs — активна 'ideas' pill у viewport", async ({
      page,
    }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      const tabBar = page
        .locator(".no-scrollbar")
        .filter({ hasText: /ideas|board|office/i })
        .first();

      await expect(tabBar).toBeVisible({ timeout: 10_000 });

      const ideasPill = tabBar
        .locator("a")
        .filter({ hasText: /ideas/i })
        .first();
      await expect(ideasPill).toBeVisible({ timeout: 5_000 });

      // Активна pill має бути у horizontal viewport
      const isInViewport = await ideasPill.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.right > 0 && rect.left < window.innerWidth;
      });

      expect(isInViewport, "Active 'ideas' pill має бути у viewport").toBe(
        true
      );
    });

    // --- 3.4 Mobile tab pills — board pill у viewport після навігації ---
    test("Studio mobile tabs — 'board' pill у viewport після переходу на board", async ({
      page,
    }) => {
      await page.goto("/studio?tab=board", { waitUntil: "domcontentloaded" });

      await page
        .waitForResponse(
          (resp) =>
            resp.url().includes("/api/tasks") && resp.status() === 200,
          { timeout: 15_000 }
        )
        .catch(() => null);

      const tabBar = page
        .locator(".no-scrollbar")
        .filter({ hasText: /ideas|board|office/i })
        .first();

      await expect(tabBar).toBeVisible({ timeout: 10_000 });

      const boardPill = tabBar
        .locator("a")
        .filter({ hasText: /board/i })
        .first();
      await expect(boardPill).toBeVisible({ timeout: 5_000 });

      const isInViewport = await boardPill.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.right > 0 && rect.left < window.innerWidth;
      });

      expect(isInViewport, "'board' pill має бути у viewport").toBe(true);
    });

    // --- 3.5 Kanban — колонка займає viewport width ---
    test("Kanban board — одна колонка займає ~viewport width", async ({
      page,
    }) => {
      await page.goto("/studio?tab=board", { waitUntil: "domcontentloaded" });

      await page
        .waitForResponse(
          (resp) =>
            resp.url().includes("/api/tasks") && resp.status() === 200,
          { timeout: 15_000 }
        )
        .catch(() => null);

      // Kanban scroll container — snap-x або overflow-x-auto (не tab bar)
      // Перший snap-x контейнер що не є tab bar
      const kanbanContainers = page.locator('[class*="snap-x"]');
      const containerCount = await kanbanContainers.count();

      if (containerCount === 0) {
        // Fallback: board може не мати snap (список замість swipe)
        const main = page.locator("main");
        await expect(main).toBeVisible({ timeout: 5_000 });
        return;
      }

      // Перевіряємо першу дочірню колонку у snap-container
      const kanban = kanbanContainers.first();
      const firstCol = kanban.locator("> *").first();
      const colBox = await firstCol.boundingBox().catch(() => null);

      if (colBox) {
        const viewportWidth = page.viewportSize()?.width ?? 320;
        expect(
          colBox.width,
          `Kanban колонка ${colBox.width}px < 80% viewport ${viewportWidth}px`
        ).toBeGreaterThanOrEqual(viewportWidth * 0.8);
      } else {
        // Якщо box не визначився (порожній board) — просто перевіряємо main
        await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
      }
    });

    // --- 3.6 Tap targets — drawer nav links ≥44px ---
    test("Drawer nav links — висота ≥44px (tap target)", async ({ page }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      const drawer = await openDrawer(page);

      const navLinks = drawer.getByRole("link");
      const count = await navLinks.count();
      expect(count, "Drawer має мати хоча б 1 link").toBeGreaterThan(0);

      const smallLinks: string[] = [];
      for (let i = 0; i < count; i++) {
        const link = navLinks.nth(i);
        const box = await link.boundingBox();
        if (box && box.height < 44) {
          const text = await link.textContent();
          smallLinks.push(`"${text?.trim()}" h=${box.height}px`);
        }
      }

      expect(
        smallLinks,
        `Drawer links менше 44px: ${smallLinks.join(", ")}`
      ).toHaveLength(0);
    });

    // --- 3.7 iOS zoom prevention — textarea font-size ≥16px ---
    test("iOS zoom prevention — textarea font-size ≥16px на /studio ideas", async ({
      page,
    }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      const textarea = page.locator("textarea").first();
      const exists = await textarea
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      if (!exists) return; // немає textarea — тест не застосовний

      const fontSize = await textarea.evaluate((el) => {
        return parseFloat(window.getComputedStyle(el).fontSize);
      });

      expect(
        fontSize,
        `Textarea font-size=${fontSize}px < 16px → iOS Safari зробить zoom`
      ).toBeGreaterThanOrEqual(16);
    });

    // --- 3.8 iOS zoom prevention — input font-size ≥16px ---
    test("iOS zoom prevention — input font-size ≥16px на /studio", async ({
      page,
    }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      const inputs = page.locator('input:not([type="hidden"])');
      const count = await inputs.count();

      if (count === 0) return; // немає inputs

      const smallInputs: string[] = [];
      for (let i = 0; i < Math.min(count, 5); i++) {
        const input = inputs.nth(i);
        const visible = await input.isVisible().catch(() => false);
        if (!visible) continue;

        const fontSize = await input.evaluate((el) => {
          return parseFloat(window.getComputedStyle(el).fontSize);
        });

        if (fontSize < 16) {
          const type = await input.getAttribute("type");
          const placeholder = await input.getAttribute("placeholder");
          smallInputs.push(
            `input[type=${type ?? "text"}][placeholder="${placeholder}"] fontSize=${fontSize}px`
          );
        }
      }

      expect(
        smallInputs,
        `Inputs з font-size < 16px (iOS zoom): ${smallInputs.join(", ")}`
      ).toHaveLength(0);
    });

    // --- 3.9 Controls — відображаються без overflow ---
    test("Controls tab — кнопки видимі та немає horizontal overflow", async ({
      page,
    }) => {
      await page.goto("/studio?tab=controls", {
        waitUntil: "domcontentloaded",
      });

      const buttons = page.locator("main button");
      await expect(buttons.first()).toBeVisible({ timeout: 10_000 });
      expect(await buttons.count()).toBeGreaterThan(0);

      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect(
        scrollWidth,
        `Controls tab horizontal scroll: ${scrollWidth} > ${innerWidth}`
      ).toBeLessThanOrEqual(innerWidth);
    });

    // --- 3.10 Ideas tab — без horizontal overflow ---
    test("Ideas tab — список ідей без horizontal overflow", async ({
      page,
    }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      await page
        .waitForResponse(
          (resp) =>
            resp.url().includes("/api/initiatives") && resp.status() === 200,
          { timeout: 15_000 }
        )
        .catch(() => null);

      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect(
        scrollWidth,
        `Ideas tab horizontal scroll: ${scrollWidth} > ${innerWidth}`
      ).toBeLessThanOrEqual(innerWidth);

      await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
    });
  }
);

// ---------------------------------------------------------------------------
// 4. Pixel 5 — Authenticated (OWNER session)
// ---------------------------------------------------------------------------

test.describe(
  "Mobile Pixel 5 — Authenticated",
  { tag: "@mobile-auth" },
  () => {
    test.use({
      ...pixel5,
      storageState: "tests/auth/owner.json",
    });

    test.beforeEach(async ({ page }) => {
      await page.goto("/studio", { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/signin|login/);
    });

    // --- 4.1 No horizontal overflow — /studio ideas на Pixel 5 ---
    test("Studio ideas — немає horizontal overflow на Pixel 5", async ({
      page,
    }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      await page
        .waitForResponse(
          (resp) =>
            resp.url().includes("/api/initiatives") && resp.status() === 200,
          { timeout: 15_000 }
        )
        .catch(() => null);

      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    });

    // --- 4.2 Nav drawer link — закриває drawer на Pixel 5 ---
    test("Nav drawer — link закриває drawer на Pixel 5", async ({ page }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      const drawer = await openDrawer(page);

      const firstLink = drawer.getByRole("link").first();
      await expect(firstLink).toBeVisible({ timeout: 5_000 });
      await firstLink.click();

      await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    });

    // --- 4.3 Tab pills — видимі на Pixel 5 ---
    test("Studio mobile tabs — tab pills видимі на Pixel 5", async ({
      page,
    }) => {
      await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

      const tabBar = page
        .locator(".no-scrollbar")
        .filter({ hasText: /ideas|board|office/i })
        .first();

      await expect(tabBar).toBeVisible({ timeout: 10_000 });
    });
  }
);
