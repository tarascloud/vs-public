/**
 * Playwright Global Setup — автоматичне отримання OWNER storageState
 *
 * VS використовує Google/GitHub OAuth (NextAuth), тому programmatic
 * credentials login неможливий без реального браузера. Цей файл:
 *
 * 1. Якщо tests/auth/owner.json вже існує — нічого не робить (reuse).
 * 2. Якщо OWNER_EMAIL + OWNER_PASSWORD задані (credentials provider) —
 *    намагається POST /api/auth/callback/credentials (тільки для dev/test NextAuth setup).
 * 3. Інакше — виводить інструкцію для ручного отримання owner.json і завершується
 *    з помилкою якщо CI=true (не пропускає nightly на CI без auth).
 *
 * Ручне отримання owner.json (один раз):
 *   npx playwright codegen --save-storage=tests/auth/owner.json https://vibe-studio.example.com
 *   # Залогінитись через Google/GitHub → закрити браузер → owner.json готовий
 *
 * Або через Playwright UI:
 *   npx playwright test --ui  # відкрити, залогінитись, зберегти storage
 */

import { chromium, type FullConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const OWNER_JSON_PATH = path.join(
  process.cwd(),
  "tests",
  "auth",
  "owner.json"
);

async function globalSetup(config: FullConfig): Promise<void> {
  // 1. Reuse existing storageState — не логінимось повторно
  if (fs.existsSync(OWNER_JSON_PATH)) {
    console.log("[global-setup] tests/auth/owner.json знайдено — reuse.");
    return;
  }

  const ownerEmail =
    process.env.OWNER_EMAIL ?? "owner@example.com";
  const ownerPassword = process.env.OWNER_PASSWORD ?? "";
  const baseURL =
    process.env.BASE_URL ??
    config.projects[0]?.use?.baseURL ??
    "http://localhost:3000";

  // 2. Спроба programmatic credentials login (якщо NextAuth credentials provider налаштовано)
  if (ownerPassword) {
    console.log(
      "[global-setup] OWNER_PASSWORD задано — спроба credentials login..."
    );
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
      const response = await page.request.post(
        `${baseURL}/api/auth/callback/credentials`,
        {
          form: {
            email: ownerEmail,
            password: ownerPassword,
            csrfToken: "",
          },
        }
      );

      if (response.ok()) {
        // Зберігаємо storageState (cookies + localStorage)
        fs.mkdirSync(path.dirname(OWNER_JSON_PATH), { recursive: true });
        await page.context().storageState({ path: OWNER_JSON_PATH });
        console.log("[global-setup] storageState збережено в", OWNER_JSON_PATH);
        await browser.close();
        return;
      } else {
        console.warn(
          `[global-setup] credentials login повернув ${response.status()} — credentials provider не налаштовано?`
        );
      }
    } catch (err) {
      console.warn("[global-setup] credentials login помилка:", err);
    } finally {
      await browser.close();
    }
  }

  // 3. owner.json відсутній і auto-login не вдався
  const instruction = `
[global-setup] tests/auth/owner.json не знайдено.

Отримати вручну (один раз):
  npx playwright codegen \\
    --save-storage=tests/auth/owner.json \\
    ${baseURL}
  # Залогінитись через Google/GitHub → закрити браузер

Або з OWNER_PASSWORD (якщо credentials provider налаштовано):
  OWNER_EMAIL=owner@example.com OWNER_PASSWORD=<pass> \\
    npx playwright test tests/nightly/vs-e2e.spec.ts

Файл tests/auth/owner.json знаходиться у .gitignore — не комітити.
`;

  if (process.env.CI) {
    // На CI без owner.json authenticated тести не запустяться — fail fast
    throw new Error(instruction);
  } else {
    // Локально — попереджаємо, @auth тести пропустяться через відсутній storageState
    console.warn(instruction);
  }
}

export default globalSetup;
