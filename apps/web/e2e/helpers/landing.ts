import { expect, type Locator, type Page } from "@playwright/test";
import { button, textOf } from "./ui.ts";

export const REPO_URL = "https://github.com/CompleWin/timetracker.complewin.ru";

export const RUSSIAN_HEADLINE = "Бесплатный трекер времени";
export const ENGLISH_HEADLINE = "Free time tracker";

const DEMO_TIMELINE_TITLE = /^(Хронология|Timeline)$/;
const PLAYBACK_STEP_MS = 100;

export function languageButton(page: Page): Locator {
  return button(page, "Язык");
}

export function languageList(page: Page): Locator {
  return page.getByRole("listbox");
}

export function languageOption(page: Page, name: string): Locator {
  return languageList(page).getByRole("option", { name, exact: true });
}

export async function chooseLanguage(page: Page, name: string): Promise<void> {
  await languageButton(page).click();
  await languageOption(page, name).click();
}

export function heroBadge(page: Page): Locator {
  return page
    .locator("*")
    .filter({ has: textOf(page, "Ты на этой странице") })
    .filter({ has: page.getByText(/^\d+:\d{2}:\d{2}$/) })
    .last();
}

export function demo(page: Page): Locator {
  return page
    .locator('[aria-hidden="true"]')
    .filter({ has: page.getByText(DEMO_TIMELINE_TITLE) })
    .first();
}

export async function scrollDemoIntoView(page: Page): Promise<void> {
  await expect(demo(page)).toBeVisible();
  await demo(page).evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "instant" }),
  );
}

export function timersBlock(page: Page, header: string): Locator {
  return demo(page)
    .locator("*")
    .filter({ has: textOf(page, header) })
    .filter({ hasNot: page.getByText(DEMO_TIMELINE_TITLE) })
    .first();
}

export function shownTexts(scope: Locator, text: string): Locator {
  return textOf(scope, text).filter({ visible: true });
}

export async function isOnScreen(locator: Locator): Promise<boolean> {
  return locator.evaluateAll(async (elements) => {
    function isTransparent(element: Element): boolean {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.opacity === "0" || style.visibility === "hidden") return true;
      }
      return false;
    }

    function visibleRatio(element: Element): Promise<number> {
      return new Promise((resolve) => {
        const observer = new IntersectionObserver((entries) => {
          observer.disconnect();
          resolve(entries[0]?.intersectionRatio ?? 0);
        });
        observer.observe(element);
      });
    }

    const opaque = elements.filter((element) => !isTransparent(element));
    const ratios = await Promise.all(opaque.map(visibleRatio));
    return ratios.some((ratio) => ratio > 0);
  });
}

function virtualNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

export type DemoPlayback = (moment: string, isReached: () => Promise<boolean>) => Promise<void>;

export async function startDemoPlayback(page: Page, limitMs: number): Promise<DemoPlayback> {
  const startedAt = await virtualNow(page);
  return async (moment, isReached) => {
    while (!(await isReached())) {
      const elapsedMs = (await virtualNow(page)) - startedAt;
      expect(elapsedMs, `демо не показало ${moment}`).toBeLessThanOrEqual(limitMs);
      await page.clock.runFor(PLAYBACK_STEP_MS);
    }
  };
}
