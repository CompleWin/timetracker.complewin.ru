import { expect, test } from "@playwright/test";
import { goToSection } from "./helpers/account-menu.ts";
import { currentUser } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { ENGLISH_HEADLINE, RUSSIAN_HEADLINE, chooseLanguage } from "./helpers/landing.ts";
import { pickerTrigger } from "./helpers/picker.ts";
import { link, pageFooter, pageTitle } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const APP_TITLE = "SimpleTimeTracker";
const RUSSIAN_LANDING_TITLE = "SimpleTimeTracker: бесплатный трекер времени";
const ENGLISH_LANDING_TITLE = "SimpleTimeTracker: free time tracker";
const PRIVACY_TITLE = "Политика конфиденциальности";

test.describe("английский язык браузера", () => {
  test.use({ locale: "en-US" });

  test("12. /ru показывает русский лендинг и гостевую шапку", async ({ page }) => {
    await page.goto("/ru");

    const header = page.getByRole("banner");
    await expect(pageTitle(page, RUSSIAN_HEADLINE)).toBeVisible();
    await expect(header.getByRole("button", { name: "Язык", exact: true })).toBeVisible();
    await expect(link(header, "GitHub")).toBeVisible();
    await expect(link(header, "Войти")).toBeVisible();
    await expect(page).toHaveTitle(RUSSIAN_LANDING_TITLE);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");

    await page.goto("/");

    await expect(pageTitle(page, RUSSIAN_HEADLINE)).toBeVisible();
  });
});

test("12. /en показывает английский лендинг при русском языке браузера", async ({ page }) => {
  await page.goto("/en");

  await expect(pageTitle(page, ENGLISH_HEADLINE)).toBeVisible();
  await expect(page).toHaveTitle(ENGLISH_LANDING_TITLE);
});

test("13. выбор English на /ru открывает /en и сохраняется при открытии /", async ({ page }) => {
  await page.goto("/ru");

  await chooseLanguage(page, "English");

  await expect(page).toHaveURL(urlMatching("/en"));
  await expect(pageTitle(page, ENGLISH_HEADLINE)).toBeVisible();

  await page.goto("/");

  await expect(pageTitle(page, ENGLISH_HEADLINE)).toBeVisible();
});

test("15. для вошедшего /en открывает трекер на русском", async ({ page }) => {
  await loginAs(page, { locale: "ru" });

  await page.goto("/en");

  await expect(page).toHaveURL(urlMatching("/"));
  await expect(pickerTrigger(page)).toBeVisible();
  await expect(page).toHaveTitle(APP_TITLE);
});

test("16. заголовок вкладки обновляется при переходе с /privacy на /terms и на лендинг", async ({
  page,
}) => {
  await page.goto("/privacy");
  await expect(pageTitle(page, PRIVACY_TITLE)).toBeVisible();
  await expect(page).toHaveTitle(PRIVACY_TITLE);

  await link(pageFooter(page), "Условия").click();
  await expect(page).toHaveURL(urlMatching("/terms"));
  await expect(page).toHaveTitle("Условия использования");

  await link(page.getByRole("banner"), APP_TITLE).click();
  await expect(page).toHaveURL(urlMatching("/"));
  await expect(pageTitle(page, RUSSIAN_HEADLINE)).toBeVisible();
  await expect(page).toHaveTitle(RUSSIAN_LANDING_TITLE);
});

test("17. при переходе с /privacy в настройки заголовок вкладки становится SimpleTimeTracker", async ({
  page,
}) => {
  await loginAs(page, { locale: "ru" });
  await page.goto("/privacy");
  await expect(page).toHaveTitle(PRIVACY_TITLE);

  await goToSection(page, "Настройки");

  await expect(page).toHaveURL(urlMatching("/settings"));
  await expect(page).toHaveTitle(APP_TITLE);
});

test("19. браузер переводит с /tasks/123/extra на главную", async ({ page }) => {
  await page.goto("/tasks/123/extra");

  await expect(page).toHaveURL(urlMatching("/"));
  await expect(pageTitle(page, RUSSIAN_HEADLINE)).toBeVisible();
});

test("21. переход на /en сохраняет русский язык профиля и возвращает на /privacy одним нажатием Назад", async ({
  page,
}) => {
  await loginAs(page, { locale: "ru" });
  await page.goto("/privacy");
  await expect(pageTitle(page, PRIVACY_TITLE)).toBeVisible();

  await page.goto("/en");

  await expect(page).toHaveURL(urlMatching("/"));
  await expect(pickerTrigger(page)).toBeVisible();
  expect(await currentUser(page)).toMatchObject({ locale: "ru" });

  await page.goBack();

  await expect(page).toHaveURL(urlMatching("/privacy"));
  await expect(pageTitle(page, PRIVACY_TITLE)).toBeVisible();
});
