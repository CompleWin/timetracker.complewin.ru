import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";
import { button, dialog, field } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

type DeletionTexts = {
  openButton: string;
  dialogTitle: string;
  confirmField: string;
  confirmButton: string;
  confirmWord: string;
  otherLanguageWord: string;
};

const russian: DeletionTexts = {
  openButton: "Удалить аккаунт",
  dialogTitle: "Удаление аккаунта",
  confirmField: "Напиши «удалить», чтобы подтвердить",
  confirmButton: "Удалить навсегда",
  confirmWord: "удалить",
  otherLanguageWord: "delete",
};

const english: DeletionTexts = {
  openButton: "Delete account",
  dialogTitle: "Delete account",
  confirmField: "Type “delete” to confirm",
  confirmButton: "Delete forever",
  confirmWord: "delete",
  otherLanguageWord: "удалить",
};

async function openDeletionDialog(page: Page, texts: DeletionTexts): Promise<Locator> {
  await page.goto("/settings");
  await button(page, texts.openButton).click();
  const deletion = dialog(page, texts.dialogTitle);
  await expect(deletion).toBeVisible();
  return deletion;
}

async function expectConfirmEnabledOnlyByWord(
  deletion: Locator,
  texts: DeletionTexts,
): Promise<void> {
  const confirm = button(deletion, texts.confirmButton);
  const confirmField = field(deletion, texts.confirmField);
  await expect(confirm).toBeDisabled();

  for (const wrongWord of [texts.confirmWord.slice(0, -1), texts.otherLanguageWord]) {
    await confirmField.fill(wrongWord);
    await expect(confirm).toBeDisabled();
  }

  await confirmField.fill(texts.confirmWord);
  await expect(confirm).toBeEnabled();
}

test("13. «Удалить навсегда» неактивна, пока не введено «удалить»; после подтверждения открывается /login", async ({
  page,
}) => {
  await loginAs(page);
  const deletion = await openDeletionDialog(page, russian);

  await expectConfirmEnabledOnlyByWord(deletion, russian);
  await button(deletion, russian.confirmButton).click();

  await expect(page).toHaveURL(urlMatching("/login"));
});

test("13. в английском интерфейсе «Delete forever» активна только после ввода delete", async ({
  page,
}) => {
  await loginAs(page, { locale: "en" });
  const deletion = await openDeletionDialog(page, english);

  await expectConfirmEnabledOnlyByWord(deletion, english);
});
