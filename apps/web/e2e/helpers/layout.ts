import { expect, type Page } from "@playwright/test";

export const PHONE_VIEWPORT = { width: 390, height: 844 };

export const PAGE_TITLE_FONT_SIZE = "28px";

async function documentWidths(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const { scrollWidth, clientWidth } = document.documentElement;
    return { scrollWidth, clientWidth };
  });
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await documentWidths(page);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
