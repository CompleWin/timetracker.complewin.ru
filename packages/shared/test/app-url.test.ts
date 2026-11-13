import { describe, expect, it } from "vitest";
import { parseAppUrl } from "@stt/shared";

const VARIABLE_NAME = "STAGING_APP_URL";

describe("parseAppUrl", () => {
  it("1. адрес на workers.dev даёт customDomain: false и тот же appUrl", () => {
    const workersDevUrl = "https://stt-production.someone.workers.dev";

    expect(parseAppUrl(VARIABLE_NAME, workersDevUrl)).toMatchObject({
      appUrl: workersDevUrl,
      host: "stt-production.someone.workers.dev",
      customDomain: false,
    });
  });

  it("2. свой домен приводится к нижнему регистру, / в конце отбрасывается, customDomain: true", () => {
    expect(parseAppUrl(VARIABLE_NAME, "https://Tracker.Example.com/")).toMatchObject({
      appUrl: "https://tracker.example.com",
      host: "tracker.example.com",
      customDomain: true,
    });
  });

  it.each([
    ["пустая строка", ""],
    ["не задано", undefined],
    ["протокол http", "http://tracker.example.com"],
    ["путь", "https://tracker.example.com/app"],
    ["query", "https://tracker.example.com?x=1"],
    ["fragment", "https://tracker.example.com#top"],
    ["порт", "https://tracker.example.com:8443"],
    ["пользователь", "https://user@tracker.example.com"],
    ["пользователь и пароль", "https://user:secret@tracker.example.com"],
    ["без протокола", "tracker.example.com"],
  ])("3. %s даёт ошибку с именем переменной", (_case, value) => {
    expect(() => parseAppUrl(VARIABLE_NAME, value)).toThrow(VARIABLE_NAME);
  });
});
