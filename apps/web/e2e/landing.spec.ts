import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";
import { clockIn, readClockSec } from "./helpers/clock.ts";
import {
  ENGLISH_HEADLINE,
  REPO_URL,
  RUSSIAN_HEADLINE,
  heroBadge,
  languageButton,
  languageList,
  languageOption,
} from "./helpers/landing.ts";
import { PHONE_VIEWPORT, expectNoHorizontalScroll } from "./helpers/layout.ts";
import { pickerTrigger } from "./helpers/picker.ts";
import { link, pageFooter, pageTitle, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

type NamedLink = {
  name: string;
  find: (page: Page) => Locator;
};

type FeatureCard = {
  label: string;
  title: string;
  text: string;
};

type FooterHost = {
  path: string;
  prepare: (page: Page) => Promise<unknown>;
};

const SUBTITLE =
  "Запускай таймеры по задачам и проектам, хоть несколько сразу. С телефона и компьютера, вход через Telegram. Бесплатная интеграция с Notion";
const RUSSIAN_TITLE = "SimpleTimeTracker: бесплатный трекер времени";
const ENGLISH_TITLE = "SimpleTimeTracker: free time tracker";
const FEATURES_HEADING = "Что умеет трекер";
const NOTION_HEADING = "Подключи свою базу данных Notion";
const NOTION_TEXT =
  "Трекер полностью работает и без него. Но если задачи живут в Notion, подключи базу: время само запишется в поле задачи, а журнал сессий с заметками появится прямо на её странице.";
const NOOPENER = /(^|\s)noopener(\s|$)/;
const BADGE_WAIT_MS = 3_000;

const loginLinks: NamedLink[] = [
  { name: "«Попробовать бесплатно»", find: (page) => link(page, "Попробовать бесплатно") },
  { name: "«Войти» в шапке", find: (page) => link(page.getByRole("banner"), "Войти") },
];

const githubLinks: NamedLink[] = [
  { name: "«Star на GitHub»", find: (page) => link(page, "Star на GitHub") },
  { name: "«GitHub» в шапке", find: (page) => link(page.getByRole("banner"), "GitHub") },
  { name: "«GitHub» в подвале", find: (page) => link(pageFooter(page), "GitHub") },
];

const featureCards: FeatureCard[] = [
  {
    label: "Таймеры",
    title: "Несколько сразу",
    text: "Созвон и отчёт могут идти одновременно. Каждой задаче засчитывается её полное время.",
  },
  {
    label: "Заметки",
    title: "Что сделал за отрезок",
    text: "К каждой сессии можно написать заметку, пока таймер идёт или после остановки.",
  },
  {
    label: "Хронология",
    title: "Весь день на одной шкале",
    text: "Сессии по часам, параллельные рядом. Пропуски видно сразу, их можно заполнить в один клик.",
  },
  {
    label: "Telegram",
    title: "Вход без пароля",
    text: "Входишь через Telegram. Бот напомнит о забытом таймере и остановит его прямо из чата.",
  },
  {
    label: "Устройства",
    title: "Телефон и компьютер",
    text: "Запустил на телефоне, остановил на компьютере. Трекер ставится на телефон как приложение.",
  },
];

const asGuest = (): Promise<void> => Promise.resolve();

const footerHosts: FooterHost[] = [
  { path: "/login", prepare: asGuest },
  { path: "/settings", prepare: loginAs },
];

function headingOfLevel(scope: Page | Locator, level: number, name: string): Locator {
  return scope.getByRole("heading", { level, name, exact: true });
}

function featureCard(page: Page, card: FeatureCard): Locator {
  return page
    .locator("*")
    .filter({ has: textOf(page, card.label) })
    .filter({ has: headingOfLevel(page, 3, card.title) })
    .filter({ has: textOf(page, card.text) })
    .last();
}

async function openLanguageList(page: Page): Promise<void> {
  await languageButton(page).click();
  await expect(languageList(page)).toBeVisible();
}

async function expectRussianLanding(page: Page): Promise<void> {
  await expect(pageTitle(page, RUSSIAN_HEADLINE)).toBeVisible();
  await expect(languageButton(page)).toHaveAttribute("aria-expanded", "false");
}

async function expectEnglishLanding(page: Page): Promise<void> {
  await expect(pageTitle(page, ENGLISH_HEADLINE)).toBeVisible();
  await expect(link(page, "Try it free")).toBeVisible();
  await expect(link(page.getByRole("banner"), "Sign in")).toBeVisible();
  await expect(link(page, "Star on GitHub")).toBeVisible();
  await expect(page).toHaveTitle(ENGLISH_TITLE);
}

test("2. / без сессии показывает h1, подзаголовок, «Открытый исходный код» и <title> главной для гостя", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(urlMatching("/"));
  await expect(pageTitle(page, RUSSIAN_HEADLINE)).toBeVisible();
  await expect(textOf(page, SUBTITLE)).toBeVisible();
  await expect(textOf(page, "Открытый исходный код")).toBeVisible();
  await expect(page).toHaveTitle(RUSSIAN_TITLE);
});

for (const loginLink of loginLinks) {
  test(`3. ссылка ${loginLink.name} на главной для гостя ведёт на /login`, async ({ page }) => {
    await page.goto("/");

    await loginLink.find(page).click();

    await expect(page).toHaveURL(urlMatching("/login"));
  });
}

for (const githubLink of githubLinks) {
  test(`4. ссылка ${githubLink.name} на главной для гостя ведёт на REPO_URL в новой вкладке`, async ({
    page,
  }) => {
    await page.goto("/");
    const found = githubLink.find(page);

    await expect(found).toHaveAttribute("href", REPO_URL);
    await expect(found).toHaveAttribute("target", "_blank");
    await expect(found).toHaveAttribute("rel", NOOPENER);
  });
}

test("5. в бейдже «Ты на этой странице» и часы H:MM:SS, через 3 секунды часы показывают большее время", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const badge = heroBadge(page);
  const clock = clockIn(badge);
  await expect(textOf(badge, "Ты на этой странице")).toBeVisible();
  await expect(clock).toBeVisible();
  const shownAtStart = await readClockSec(clock);

  await page.clock.runFor(BADGE_WAIT_MS);

  await expect.poll(() => readClockSec(clock)).toBeGreaterThan(shownAtStart);
});

test("6. видны h2 «Что умеет трекер» и пять карточек, h2 блока Notion и его абзац", async ({
  page,
}) => {
  await page.goto("/");

  await expect(headingOfLevel(page, 2, FEATURES_HEADING)).toBeVisible();
  for (const card of featureCards) {
    const cardElement = featureCard(page, card);
    await expect(textOf(cardElement, card.label)).toBeVisible();
    await expect(headingOfLevel(cardElement, 3, card.title)).toBeVisible();
    await expect(textOf(cardElement, card.text)).toBeVisible();
  }
  await expect(headingOfLevel(page, 2, NOTION_HEADING)).toBeVisible();
  await expect(textOf(page, NOTION_TEXT)).toBeVisible();
});

test("7. «Язык» открывает список «Русский» и «English», выбор «English» переводит страницу и сохраняется после перезагрузки", async ({
  page,
}) => {
  await page.goto("/");
  await expect(languageButton(page)).toHaveAttribute("aria-expanded", "false");

  await openLanguageList(page);

  await expect(languageButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(languageOption(page, "Русский")).toHaveAttribute("aria-selected", "true");
  await expect(languageOption(page, "English")).toHaveAttribute("aria-selected", "false");

  await languageOption(page, "English").click();

  await expect(languageList(page)).toBeHidden();
  await expectEnglishLanding(page);

  await page.reload();

  await expectEnglishLanding(page);
});

test("8. Esc закрывает список языков, фокус снова на «Язык», язык не меняется", async ({
  page,
}) => {
  await page.goto("/");
  await openLanguageList(page);

  await page.keyboard.press("Escape");

  await expect(languageList(page)).toBeHidden();
  await expect(languageButton(page)).toBeFocused();
  await expectRussianLanding(page);
});

test("8. нажатие мимо списка языков закрывает его, язык не меняется", async ({ page }) => {
  await page.goto("/");
  await openLanguageList(page);

  await pageTitle(page, RUSSIAN_HEADLINE).click();

  await expect(languageList(page)).toBeHidden();
  await expectRussianLanding(page);
});

test("9. у вошедшего на / нет кнопки «Язык» и ссылки «Войти», <title> «SimpleTimeTracker»", async ({
  page,
}) => {
  await loginAs(page);

  await page.goto("/");

  await expect(pickerTrigger(page)).toBeVisible();
  await expect(languageButton(page)).toHaveCount(0);
  await expect(link(page, "Войти")).toHaveCount(0);
  await expect(page).toHaveTitle("SimpleTimeTracker");
});

for (const host of footerHosts) {
  test(`10. на ${host.path} в подвале ссылка «GitHub» на REPO_URL`, async ({ page }) => {
    await host.prepare(page);

    await page.goto(host.path);

    await expect(link(pageFooter(page), "GitHub")).toHaveAttribute("href", REPO_URL);
  });
}

test.describe("ширина окна 390 px", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("16. на главной для гостя нет горизонтальной прокрутки", async ({ page }) => {
    await page.goto("/");
    await expect(pageTitle(page, RUSSIAN_HEADLINE)).toBeVisible();
    await expect(textOf(page, "Сводка за сегодня")).toBeVisible();

    await expectNoHorizontalScroll(page);
  });
});
