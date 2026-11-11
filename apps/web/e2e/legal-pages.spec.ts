import { expect, test, type Page } from "@playwright/test";
import { publisherContacts } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { link, pageFooter, pageTitle } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

type LegalPage = {
  path: string;
  footerLink: string;
  title: string;
};

type FooterHost = {
  name: string;
  path: string;
  prepare: (page: Page) => Promise<unknown>;
};

const legalPages: LegalPage[] = [
  { path: "/privacy", footerLink: "Конфиденциальность", title: "Политика конфиденциальности" },
  { path: "/terms", footerLink: "Условия", title: "Условия использования" },
];

const asGuest = (): Promise<void> => Promise.resolve();

const footerHosts: FooterHost[] = [
  { name: "главной для гостя", path: "/", prepare: asGuest },
  { name: "/login", path: "/login", prepare: asGuest },
  { name: "/settings", path: "/settings", prepare: loginAs },
];

for (const legal of legalPages) {
  test(`11. ${legal.path} открывается без сессии с заголовком «${legal.title}»`, async ({
    page,
  }) => {
    await page.goto(legal.path);

    await expect(page).toHaveURL(urlMatching(legal.path));
    await expect(pageTitle(page, legal.title)).toBeVisible();
  });

  for (const host of footerHosts) {
    test(`11. ссылка «${legal.footerLink}» в подвале ${host.name} ведёт на «${legal.title}»`, async ({
      page,
    }) => {
      await host.prepare(page);
      await page.goto(host.path);

      await link(pageFooter(page), legal.footerLink).click();

      await expect(page).toHaveURL(urlMatching(legal.path));
      await expect(pageTitle(page, legal.title)).toBeVisible();
    });
  }
}

test("12. на /privacy видны publisherName и supportEmail из GET /api/health", async ({ page }) => {
  await page.goto("/privacy");
  const { publisherName, supportEmail } = await publisherContacts(page);

  for (const contact of [publisherName, supportEmail]) {
    expect(contact).toMatch(/\S/);
    await expect(page.getByText(contact).first()).toBeVisible();
  }
});
