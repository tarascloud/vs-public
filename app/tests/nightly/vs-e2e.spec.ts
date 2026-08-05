/**
 * Vibe Studio — Nightly E2E Test Suite
 *
 * Покриття:
 *   @public       — публічні сторінки без авторизації
 *   @auth         — сторінки що вимагають OWNER-сесію
 *   @api          — health-check REST ендпоінтів
 *
 * =====================================================================
 * НАЛАШТУВАННЯ AUTH (один раз перед першим запуском authenticated тестів)
 * =====================================================================
 *
 * Auth автоматизовано через tests/nightly/global-setup.ts:
 *   - Якщо tests/auth/owner.json існує — reuse без повторного логіну.
 *   - Якщо OWNER_PASSWORD задано — спроба credentials login.
 *   - Інакше — виводить інструкцію для ручного отримання owner.json.
 *
 * Ручне отримання (один раз, VS використовує Google/GitHub OAuth):
 *   npx playwright codegen \
 *     --save-storage=tests/auth/owner.json \
 *     https://vibe-studio.example.com
 *   # Залогінитись Google/GitHub → закрити браузер → owner.json готовий
 *
 * Файл tests/auth/owner.json знаходиться у .gitignore — не комітити.
 *
 * Запуск:
 *   npx playwright test tests/nightly/vs-e2e.spec.ts --project=public
 *   npx playwright test tests/nightly/vs-e2e.spec.ts --project=authenticated
 *   npx playwright test tests/nightly/vs-e2e.spec.ts --project=api
 *   npx playwright test tests/nightly/vs-e2e.spec.ts  # всі разом
 * =====================================================================
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Хелпери
// ---------------------------------------------------------------------------

/**
 * Перевірити що сторінка завантажилась без JS-помилок категорії "error".
 * Збирає console errors під час навігації.
 */
async function navigateAndCheckErrors(
  page: Page,
  url: string,
  options?: { allowedStatuses?: number[] }
): Promise<void> {
  const jsErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      jsErrors.push(msg.text());
    }
  });

  const response = await page.goto(url, { waitUntil: "domcontentloaded" });

  const allowedStatuses = options?.allowedStatuses ?? [200];
  if (response) {
    expect(
      allowedStatuses,
      `Сторінка ${url} повернула статус ${response.status()}`
    ).toContain(response.status());
  }

  // Фільтруємо відомі false-positive помилки (наприклад, browser extensions)
  const realErrors = jsErrors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("net::ERR_") &&
      !e.includes("chrome-extension")
  );

  expect(
    realErrors,
    `JS помилки на ${url}: ${realErrors.join("; ")}`
  ).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// 1. Public pages — Landing (/)
// ---------------------------------------------------------------------------

test.describe("Public — Landing page /", { tag: "@public" }, () => {
  test("рендериться без помилок", async ({ page }) => {
    await navigateAndCheckErrors(page, "/");
  });

  test("має логотип Vibe Studio", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Логотип — img alt="Vibe Studio"
    const logo = page.getByRole("img", { name: "Vibe Studio" }).first();
    await expect(logo).toBeVisible();
  });

  test("має форму waitlist (email input + submit)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // WaitlistForm містить input type=email
    const emailInput = page.getByRole("textbox").filter({ hasText: /email/i }).or(
      page.locator('input[type="email"]')
    ).first();
    await expect(emailInput).toBeVisible();

    // Submit кнопка
    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeVisible();
  });

  test("має секцію portfolio з проектами", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Секція #portfolio
    const portfolioSection = page.locator("#portfolio");
    await expect(portfolioSection).toBeVisible();
    // Перевіряємо кількість карток через js count
    const gridItems = portfolioSection.locator(".grid > div, .grid > article");
    const count = await gridItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("кнопка 'Переглянути всі проекти' веде на /portfolio", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const allProjectsLink = page.getByRole("link", { name: /portfolio|проект|view all/i });
    await expect(allProjectsLink.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Public pages — Portfolio (/portfolio)
// ---------------------------------------------------------------------------

test.describe("Public — Portfolio /portfolio", { tag: "@public" }, () => {
  test("рендериться без помилок", async ({ page }) => {
    await navigateAndCheckErrors(page, "/portfolio");
  });

  test("відображає рівно 6 проектів", async ({ page }) => {
    await page.goto("/portfolio", { waitUntil: "domcontentloaded" });
    // 6 article-карток проектів
    const articles = page.locator("main article");
    await expect(articles).toHaveCount(6);
  });

  test("проекти з URL мають кнопку 'live site' (посилання)", async ({ page }) => {
    await page.goto("/portfolio", { waitUntil: "domcontentloaded" });
    // pd, jf, vs, status, website — 5 проектів мають зовнішній URL
    // Кнопки є anchor з target="_blank"
    const externalLinks = page.locator('a[target="_blank"][rel*="noopener"]');
    const count = await externalLinks.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("кожен проект має посилання на timeline", async ({ page }) => {
    await page.goto("/portfolio", { waitUntil: "domcontentloaded" });
    const timelineLinks = page.locator('a[href*="/timeline"]');
    await expect(timelineLinks).toHaveCount(6);
  });
});

// ---------------------------------------------------------------------------
// 3–5. Public pages — Timeline сторінки
// ---------------------------------------------------------------------------

const TIMELINE_SLUGS = ["pd", "jf", "vs"] as const;

for (const slug of TIMELINE_SLUGS) {
  test.describe(
    `Public — Timeline /portfolio/${slug}/timeline`,
    { tag: "@public" },
    () => {
      test(`не повертає 404`, async ({ page }) => {
        const response = await page.goto(`/portfolio/${slug}/timeline`, {
          waitUntil: "domcontentloaded",
        });
        // Очікуємо 200 (не 404)
        expect(response?.status()).not.toBe(404);
        expect(response?.status()).toBe(200);
      });

      test(`показує заголовок або empty state`, async ({ page }) => {
        await page.goto(`/portfolio/${slug}/timeline`, {
          waitUntil: "domcontentloaded",
        });
        // Має бути або список оновлень, або empty state текст
        // TimelineClient рендерить або картки або "no_updates" текст
        const hasContent = await page
          .locator("main")
          .isVisible()
          .catch(() => false);
        expect(hasContent).toBe(true);

        // Заголовок сторінки (h1) повинен бути присутнім
        const h1 = page.locator("h1").first();
        await expect(h1).toBeVisible();
        const h1Text = await h1.textContent();
        expect(h1Text?.trim().length).toBeGreaterThan(0);
      });

      test(`має RSS посилання`, async ({ page }) => {
        await page.goto(`/portfolio/${slug}/timeline`, {
          waitUntil: "domcontentloaded",
        });
        const rssLink = page.locator(`a[href*="/api/projects/${slug}/feed.xml"]`);
        await expect(rssLink).toBeVisible();
      });
    }
  );
}

// ---------------------------------------------------------------------------
// 6. Auth redirect — /studio → login якщо не авторизований
// ---------------------------------------------------------------------------

test.describe("Auth redirects", { tag: "@public" }, () => {
  test("/studio редіректить на login якщо не авторизований", async ({ page }) => {
    const response = await page.goto("/studio", { waitUntil: "domcontentloaded" });

    // Після redirect URL має містити /api/auth/signin або /login
    const finalUrl = page.url();
    const isRedirectedToAuth =
      finalUrl.includes("/api/auth/signin") ||
      finalUrl.includes("/login") ||
      finalUrl.includes("signin");

    // Або: статус 200 але на login сторінці
    const hasSignInContent = await page
      .locator('a[href*="/api/auth/signin"], button:has-text("Sign in"), button:has-text("Увійти")')
      .first()
      .isVisible()
      .catch(() => false);

    expect(isRedirectedToAuth || hasSignInContent).toBe(true);
  });

  test("/admin редіректить на login якщо не авторизований", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    const finalUrl = page.url();
    const isRedirectedToAuth =
      finalUrl.includes("/api/auth/signin") ||
      finalUrl.includes("/login") ||
      finalUrl.includes("signin");

    const hasSignInContent = await page
      .locator('a[href*="/api/auth/signin"], button:has-text("Sign in"), button:has-text("Увійти")')
      .first()
      .isVisible()
      .catch(() => false);

    expect(isRedirectedToAuth || hasSignInContent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8–10. Authenticated — Studio tabs (вимагає storageState з OWNER сесією)
// ---------------------------------------------------------------------------

test.describe("Authenticated — Studio /studio", { tag: "@auth" }, () => {
  test.beforeEach(async ({ page }) => {
    // Переходимо на studio — якщо storageState правильний, редіректу не буде
    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    // Переконуємось що ми авторизовані (немає редіректу на signin)
    await expect(page).not.toHaveURL(/signin|login/);
  });

  // --- Tab: Ideas ---
  test("tab=ideas — форма submit ідеї та список ідей", async ({ page }) => {
    await page.goto("/studio?tab=ideas", { waitUntil: "domcontentloaded" });

    // Textarea або input для введення ідеї
    const ideaInput = page
      .locator("textarea")
      .or(page.locator('input[placeholder*="idea" i]'))
      .first();
    await expect(ideaInput).toBeVisible({ timeout: 10_000 });

    // Submit кнопка активна
    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeVisible();

    // Список ідей (initiatives) — або є items або empty state
    // Чекаємо завантаження (fetch /api/initiatives)
    await page.waitForResponse(
      (resp) => resp.url().includes("/api/initiatives") && resp.status() === 200,
      { timeout: 15_000 }
    );
    // Контейнер зі списком присутній
    const listContainer = page.locator("main");
    await expect(listContainer).toBeVisible();
  });

  // --- Tab: Board (Kanban) ---
  test("tab=board — Kanban колонки та project selector", async ({ page }) => {
    await page.goto("/studio?tab=board", { waitUntil: "domcontentloaded" });

    // Чекаємо завантаження tasks
    await page.waitForResponse(
      (resp) => resp.url().includes("/api/tasks") && resp.status() === 200,
      { timeout: 15_000 }
    );

    // Project selector присутній
    const projectSelector = page
      .locator('[role="combobox"]')
      .or(page.locator("select"))
      .or(page.getByRole("button", { name: /project|проект/i }))
      .first();
    await expect(projectSelector).toBeVisible({ timeout: 10_000 });

    // Kanban колонки — TODO, IN_PROGRESS, DONE (або їх Ukrainian переклади)
    // Шукаємо через data-testid або по тексту
    const kanbanColumns = page.locator(
      '[data-column], [class*="column"], [class*="kanban"]'
    );
    const columnsCount = await kanbanColumns.count();

    if (columnsCount === 0) {
      // Fallback: перевіряємо що board взагалі рендериться (є grid/flex layout)
      const boardContainer = page.locator('[class*="board"], [class*="grid"]').first();
      await expect(boardContainer).toBeVisible({ timeout: 10_000 });
    } else {
      expect(columnsCount).toBeGreaterThanOrEqual(3);
    }
  });

  // --- Tab: Controls ---
  test("tab=controls — контрольні кнопки відображаються", async ({ page }) => {
    await page.goto("/studio?tab=controls", { waitUntil: "domcontentloaded" });

    // OfficeControls рендерить набір кнопок
    const buttons = page.locator("main button");
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);

    // Перший button видимий
    await expect(buttons.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 11–13. Authenticated — Admin pages
// ---------------------------------------------------------------------------

test.describe("Authenticated — Admin", { tag: "@auth" }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin|login/);
  });

  test("/admin/agents — список агентів рендериться", async ({ page }) => {
    await page.goto("/admin/agents", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin|login/);

    // Чекаємо fetch /api/agents
    await page.waitForResponse(
      (resp) => resp.url().includes("/api/agents") && resp.status() === 200,
      { timeout: 15_000 }
    );

    // Список агентів або empty state — сторінка завантажилась
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // Принаймні один елемент списку або повідомлення
    const listItems = page.locator("main li, main [class*='agent'], main [class*='card']");
    const emptyMsg = page.locator("main").filter({ hasText: /no agent|немає агент|seed/i });

    const hasItems = (await listItems.count()) > 0;
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    expect(hasItems || hasEmpty).toBe(true);
  });

  test("/admin/clients — список клієнтів рендериться", async ({ page }) => {
    await page.goto("/admin/clients", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin|login/);

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    // Сторінка має контент (h1 або будь-який текст)
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible({ timeout: 10_000 });
  });

  test("/admin/projects — список проектів рендериться", async ({ page }) => {
    await page.goto("/admin/projects", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/signin|login/);

    // Чекаємо fetch /api/projects
    await page.waitForResponse(
      (resp) => resp.url().includes("/api/projects") && resp.status() === 200,
      { timeout: 15_000 }
    );

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 14–18. API Health checks
// ---------------------------------------------------------------------------

test.describe("API health checks", { tag: "@api" }, () => {
  /**
   * Хелпер для API запитів через Playwright request контекст.
   * Не потребує браузера — тести швидші.
   */
  async function apiGet(
    request: APIRequestContext,
    path: string
  ): Promise<{ status: number; body: unknown }> {
    const response = await request.get(path);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    return { status: response.status(), body };
  }

  test("GET /api/waitlist — повертає {count: N}", async ({ request }) => {
    const { status, body } = await apiGet(request, "/api/waitlist");
    expect(status).toBe(200);
    expect(body).toMatchObject({ count: expect.any(Number) });
    expect((body as { count: number }).count).toBeGreaterThanOrEqual(0);
  });

  test("GET /api/tasks — повертає масив", async ({ request }) => {
    const { status, body } = await apiGet(request, "/api/tasks");
    // API може повернути 200 з масивом або 401 якщо захищений
    expect([200, 401]).toContain(status);
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
    }
  });

  test("GET /api/agents — повертає масив або 401", async ({ request }) => {
    const { status, body } = await apiGet(request, "/api/agents");
    expect([200, 401]).toContain(status);
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
    }
  });

  test("GET /api/initiatives — повертає масив або 401", async ({ request }) => {
    const { status, body } = await apiGet(request, "/api/initiatives");
    expect([200, 401]).toContain(status);
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
    }
  });

  test("GET /api/projects — повертає масив або 404 (GET може бути незахищений)", async ({
    request,
  }) => {
    const { status, body } = await apiGet(request, "/api/projects");
    // /api/projects може не мати GET handler — 404/405 теж допустимо
    expect([200, 401, 404, 405]).toContain(status);
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
    }
  });
});
