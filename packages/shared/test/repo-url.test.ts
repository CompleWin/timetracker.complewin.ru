import { expect, it } from "vitest";
import { REPO_URL } from "@stt/shared";

it("1. REPO_URL равен https://github.com/CompleWin/timetracker.complewin.ru", () => {
  expect(REPO_URL).toBe("https://github.com/CompleWin/timetracker.complewin.ru");
});
