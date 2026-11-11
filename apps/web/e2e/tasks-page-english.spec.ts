import { expect, test } from "@playwright/test";
import { openAccountMenu } from "./helpers/account-menu.ts";
import { createTask } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { field, link, pageTitle, region, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

test("16. пользователь с locale en видит в меню «Tasks», h1 «Tasks», поле «Search tasks» и при выборе одной задачи «Selected: 1»", async ({
  page,
}) => {
  await loginAs(page, { locale: "en" });
  await createTask(page, { title: "Anki" });
  await page.goto("/");

  await openAccountMenu(page, "Menu");
  await link(page, "Tasks").click();

  await expect(page).toHaveURL(urlMatching("/tasks"));
  await expect(pageTitle(page, "Tasks")).toBeVisible();
  await expect(field(page, "Search tasks")).toBeVisible();

  await page.getByRole("checkbox", { name: "Select: Anki", exact: true }).click();

  await expect(textOf(region(page, "Selected tasks"), "Selected: 1")).toBeVisible();
});
