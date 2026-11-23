import { expect, test, type Page, type Request } from "@playwright/test";
import { accountMenu, menuButton, openAccountMenu } from "./helpers/account-menu.ts";
import { RUSSIAN_HEADLINE, chooseLanguage } from "./helpers/landing.ts";
import { PHONE_VIEWPORT } from "./helpers/layout.ts";
import { button, link, pageTitle, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const TELEGRAM_START = "/auth/telegram/start";
const PROTECTED_PATH = "/settings?from=link#profile";

const signInErrors = [
  ["cancelled", "Вход отменён", "Sign-in cancelled"],
  [
    "state",
    "Ссылка для входа устарела, попробуй ещё раз",
    "The sign-in link has expired, please try again",
  ],
  ["token", "Не удалось войти через Telegram", "Couldn't sign in with Telegram"],
  ["unavailable", "Не удалось войти через Telegram", "Couldn't sign in with Telegram"],
] as const;

const signInLinks = [
  { name: "Войти", find: (page: Page) => link(page.getByRole("banner"), "Войти") },
  { name: "Попробовать бесплатно", find: (page: Page) => link(page, "Попробовать бесплатно") },
];

test.use({ serviceWorkers: "block" });

function devButton(page: Page) {
  return button(page.getByRole("banner"), "dev");
}

async function recordTelegramStarts(page: Page): Promise<Request[]> {
  const requests: Request[] = [];
  await page.route(urlMatching(TELEGRAM_START), (route) => {
    requests.push(route.request());
    return route.fulfill({ status: 200, contentType: "text/plain", body: "Telegram OAuth start" });
  });
  return requests;
}

async function expectTelegramStart(page: Page, requests: Request[], returnTo: string) {
  await expect(page).toHaveURL(urlMatching(TELEGRAM_START, { returnTo }));
  expect(requests.map((request) => request.method())).toEqual(["GET"]);
}

async function expectGuestHome(page: Page) {
  await expect(page).toHaveURL(urlMatching("/"));
  await expect(pageTitle(page, RUSSIAN_HEADLINE)).toBeVisible();
}

async function expectDevBesideSignIn(page: Page) {
  const signIn = link(page.getByRole("banner"), "Войти");
  const dev = devButton(page);
  await expect(signIn).toBeInViewport({ ratio: 1 });
  await expect(dev).toBeInViewport({ ratio: 1 });

  const signInBox = await signIn.boundingBox();
  const devBox = await dev.boundingBox();
  if (signInBox === null || devBox === null) throw new Error("Кнопки входа должны быть видны");

  expect(devBox.x).toBeGreaterThanOrEqual(signInBox.x + signInBox.width);
  expect(devBox.y).toBeLessThan(signInBox.y + signInBox.height);
  expect(devBox.y + devBox.height).toBeGreaterThan(signInBox.y);
}

async function signInAsDev(page: Page) {
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/auth/dev-login" &&
      response.request().method() === "POST",
  );
  await devButton(page).click();
  expect((await response).status()).toBe(200);
  await expect(menuButton(page)).toBeVisible();
}

for (const signIn of signInLinks) {
  test(`1. одно нажатие «${signIn.name}» на гостевой главной запускает Telegram с возвратом на /`, async ({
    page,
  }) => {
    const requests = await recordTelegramStarts(page);
    await page.goto("/");
    await expectGuestHome(page);
    expect(requests).toHaveLength(0);

    await signIn.find(page).click();

    await expectTelegramStart(page, requests, "/");
  });

  test(`4. «${signIn.name}» с закрытого адреса передаёт путь, параметры и фрагмент`, async ({
    page,
  }) => {
    const requests = await recordTelegramStarts(page);
    await page.goto(PROTECTED_PATH);
    await expectGuestHome(page);
    await expect(page).toHaveURL(urlMatching("/", { returnTo: PROTECTED_PATH }));
    expect(requests).toHaveLength(0);

    await signIn.find(page).click();

    await expectTelegramStart(page, requests, PROTECTED_PATH);
  });
}

test("2. dev стоит справа от «Войти» на десктопе и при 390 px и открывает трекер как Dev User", async ({
  page,
}) => {
  const requests = await recordTelegramStarts(page);
  await page.goto("/");
  await expectDevBesideSignIn(page);
  await page.setViewportSize(PHONE_VIEWPORT);
  await expectDevBesideSignIn(page);

  await signInAsDev(page);
  await expect(page).toHaveURL(urlMatching("/"));
  await openAccountMenu(page);
  await expect(textOf(accountMenu(page), "Dev User")).toBeVisible();

  await test.step("5. выход через меню возвращает на гостевую главную", async () => {
    await button(accountMenu(page), "Выйти").click();
    await expectGuestHome(page);
  });

  await test.step("4. dev-вход с закрытого адреса возвращает путь и настройки", async () => {
    await page.goto(PROTECTED_PATH);
    await expectGuestHome(page);
    await signInAsDev(page);
    await expect(page).toHaveURL(
      (url) => urlMatching("/settings", { from: "link" })(url) && url.hash === "#profile",
    );
    await expect(button(page, "Удалить аккаунт")).toBeVisible();
  });

  expect(requests).toHaveLength(0);
});

test("4. Notion OAuth без сессии показывает гостевую главную с возвратом в настройки", async ({
  page,
}) => {
  const requests = await recordTelegramStarts(page);
  await page.goto("/notion/oauth/start");

  await expectGuestHome(page);
  await expect(page).toHaveURL(urlMatching("/", { returnTo: "/settings" }));
  expect(requests).toHaveLength(0);
});

test("5. старая ссылка /login показывает гостевую главную и сохраняет returnTo", async ({
  page,
}) => {
  const requests = await recordTelegramStarts(page);
  await page.goto("/login");
  await expectGuestHome(page);
  await page.goto("/login?returnTo=/settings");
  await expectGuestHome(page);
  expect(requests).toHaveLength(0);

  await link(page.getByRole("banner"), "Войти").click();

  await expectTelegramStart(page, requests, "/settings");
});

for (const [error, russian, english] of signInErrors) {
  test(`6. ${error} показывается на гостевой главной на русском и английском с ручным повтором`, async ({
    page,
  }) => {
    const requests = await recordTelegramStarts(page);
    await page.goto(`/?error=${error}`);
    await expectGuestHome(page);
    await expect(textOf(page, russian)).toBeVisible();

    await page.goto(`/login?error=${error}`);
    await expectGuestHome(page);
    await expect(textOf(page, russian)).toBeVisible();
    await chooseLanguage(page, "English");
    await expect(textOf(page, english)).toBeVisible();
    expect(requests).toHaveLength(0);

    await link(page.getByRole("banner"), "Sign in").click();

    await expectTelegramStart(page, requests, "/");
  });
}
