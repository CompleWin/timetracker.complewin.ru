import { expect, test, type Locator, type Page } from "@playwright/test";
import { createProject, createTask } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { PHONE_VIEWPORT, expectNoHorizontalScroll } from "./helpers/layout.ts";
import { openPicker, pickerTrigger, startTimerButton } from "./helpers/picker.ts";
import { focusWithKeyboard, heading } from "./helpers/ui.ts";

const PAPER = "rgb(243, 242, 242)";
const PRIMARY = "rgb(18, 91, 58)";
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const GOLOS_TEXT_FIRST = /^["']?Golos Text["']?(,|$)/;
const NETWORK_URL = /^(https?|wss?):/;

type Screen = {
  path: string;
  prepare: (page: Page) => Promise<void>;
  landmark: (page: Page) => Locator;
};

async function loginWithProjectAndTask(page: Page): Promise<void> {
  await loginAs(page);
  const sport = await createProject(page, { name: "Спорт", color: "green" });
  await createTask(page, { title: "Беговая дорожка", projectId: sport.id });
}

const loginScreen: Screen = {
  path: "/login",
  prepare: () => Promise.resolve(),
  landmark: (page) => heading(page, "Вход"),
};

const homeScreen: Screen = {
  path: "/",
  prepare: loginWithProjectAndTask,
  landmark: (page) => pickerTrigger(page),
};

const screens = [loginScreen, homeScreen];

async function open(page: Page, screen: Screen): Promise<void> {
  await screen.prepare(page);
  await page.goto(screen.path);
  await expect(screen.landmark(page)).toBeVisible();
}

function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

function outsideOrigin(urls: string[], origin: string): string[] {
  return urls.filter((url) => NETWORK_URL.test(url) && new URL(url).origin !== origin);
}

for (const screen of screens) {
  test(`17. на ${screen.path} фон body ${PAPER}, у шапки своей заливки нет`, async ({ page }) => {
    await open(page, screen);

    await expect(page.locator("body")).toHaveCSS("background-color", PAPER);
    await expect(page.getByRole("banner")).toHaveCSS("background-color", TRANSPARENT);
  });

  test(`18. на ${screen.path} font-family у body начинается с Golos Text`, async ({ page }) => {
    await open(page, screen);

    await expect(page.locator("body")).toHaveCSS("font-family", GOLOS_TEXT_FIRST);
  });

  test(`19. при загрузке ${screen.path} нет запросов вне origin приложения`, async ({ page }) => {
    await screen.prepare(page);
    const requested = recordRequests(page);

    await page.goto(screen.path, { waitUntil: "networkidle" });
    await expect(screen.landmark(page)).toBeVisible();

    expect(outsideOrigin(requested, new URL(page.url()).origin)).toEqual([]);
  });
}

test(`18. на /login document.fonts.load('800 16px "Golos Text"', 'Вход') возвращает непустой список`, async ({
  page,
}) => {
  await open(page, loginScreen);

  const loadedFaces = await page.evaluate(async () => {
    const faces = await document.fonts.load('800 16px "Golos Text"', "Вход");
    return faces.length;
  });

  expect(loadedFaces).toBeGreaterThan(0);
});

test(`20. у триггера панели выбора в фокусе с клавиатуры outline 2px solid ${PRIMARY}`, async ({
  page,
}) => {
  await loginAs(page);
  await page.goto("/");
  const trigger = pickerTrigger(page);
  await expect(trigger).toBeVisible();

  await focusWithKeyboard(page, trigger);

  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveCSS("outline-style", "solid");
  await expect(trigger).toHaveCSS("outline-width", "2px");
  await expect(trigger).toHaveCSS("outline-color", PRIMARY);
});

test.describe("ширина окна 390 px", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  for (const screen of screens) {
    test(`21. на ${screen.path} нет горизонтальной прокрутки`, async ({ page }) => {
      await open(page, screen);

      await expectNoHorizontalScroll(page);
    });
  }

  test("21. на / с открытой панелью выбора нет горизонтальной прокрутки", async ({ page }) => {
    await open(page, homeScreen);

    await openPicker(page);
    await expect(startTimerButton(page, "Беговая дорожка")).toBeVisible();

    await expectNoHorizontalScroll(page);
  });
});
