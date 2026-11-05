import { describe, expect, it } from "vitest";
import { botSetupCalls } from "@stt/shared";

const russianCommands = [
  { command: "start", description: "Включить напоминания" },
  { command: "status", description: "Что сейчас идёт" },
  { command: "stop", description: "Остановить таймер" },
];

const englishCommands = [
  { command: "start", description: "Turn on reminders" },
  { command: "status", description: "What's running" },
  { command: "stop", description: "Stop a timer" },
];

function testSetupCalls(): ReturnType<typeof botSetupCalls> {
  return botSetupCalls("https://stt.test", "secret");
}

describe("botSetupCalls", () => {
  it("14. возвращает три вызова: setWebhook, setMyCommands на ru, setMyCommands по умолчанию", () => {
    expect(testSetupCalls()).toMatchObject([
      {
        method: "setWebhook",
        body: {
          url: "https://stt.test/tg/webhook",
          secret_token: "secret",
          allowed_updates: ["message", "callback_query", "my_chat_member"],
          drop_pending_updates: true,
        },
      },
      { method: "setMyCommands", body: { language_code: "ru", commands: russianCommands } },
      { method: "setMyCommands", body: { commands: englishCommands } },
    ]);
  });

  it("14. последний setMyCommands без language_code", () => {
    expect(testSetupCalls()[2]?.body).not.toHaveProperty("language_code");
  });
});
