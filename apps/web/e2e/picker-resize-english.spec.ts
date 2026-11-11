import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";
import { openPicker } from "./helpers/picker.ts";
import { pickerRegion, resizeHandle } from "./helpers/picker-size.ts";

const ENGLISH_TRIGGER = "What are you doing? Pick a task and the timer starts right away";

test.use({ viewport: { width: 1280, height: 800 } });

test("12. пользователь с locale en видит регион «Task picker» и кнопку «Resize panel»", async ({
  page,
}) => {
  await loginAs(page, { locale: "en" });
  await page.goto("/");

  await openPicker(page, ENGLISH_TRIGGER);

  await expect(pickerRegion(page, "Task picker")).toBeVisible();
  const handle = resizeHandle(page, "Resize panel");
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("title", "Resize panel");
  await expect(handle).toHaveAccessibleDescription(
    "Arrow keys change the size, Home restores the default",
  );
});
