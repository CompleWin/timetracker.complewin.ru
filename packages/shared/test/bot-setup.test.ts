import { describe, expect, it } from "vitest";
import { botSetupCalls } from "@stt/shared";

const APP_URL = "https://stt.test";
const DESCRIPTION_MAX_LENGTH = 512;
const SHORT_DESCRIPTION_MAX_LENGTH = 120;

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

const russianDescription =
  "Я бот трекера SimpleTimeTracker. Показываю, какие таймеры сейчас идут, останавливаю их и напоминаю, если таймер идёт слишком долго.\n\n" +
  `Сначала войди в трекер через Telegram на сайте ${APP_URL}, потом нажми «Старт».`;

const englishDescription =
  "I'm the SimpleTimeTracker bot. I show which timers are running, stop them and remind you when a timer runs too long.\n\n" +
  `Sign in to the tracker with Telegram at ${APP_URL} first, then press Start.`;

const russianShortDescription = `Таймеры SimpleTimeTracker в Telegram: что идёт, остановка и напоминания. Сайт: ${APP_URL}`;

const englishShortDescription = `SimpleTimeTracker timers in Telegram: what's running, stop and reminders. Website: ${APP_URL}`;

type SetupCall = ReturnType<typeof botSetupCalls>[number];

function testSetupCalls(): ReturnType<typeof botSetupCalls> {
  return botSetupCalls(APP_URL, "secret");
}

function descriptionCalls(): SetupCall[] {
  return testSetupCalls().slice(3);
}

function callAt(index: number): SetupCall {
  const call = testSetupCalls()[index];
  if (call === undefined) throw new Error(`botSetupCalls returned no call at ${index}`);
  return call;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textField(call: SetupCall, field: string): string {
  const body: unknown = call.body;
  const value = isRecord(body) ? body[field] : undefined;
  if (typeof value !== "string") throw new Error(`${call.method} has no text field ${field}`);
  return value;
}

describe("botSetupCalls", () => {
  it("14. возвращает семь вызовов, первые три: setWebhook, setMyCommands на ru, setMyCommands по умолчанию", () => {
    const calls = testSetupCalls();

    expect(calls).toHaveLength(7);
    expect(calls.slice(0, 3)).toMatchObject([
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
    expect(callAt(2).body).not.toHaveProperty("language_code");
  });

  it("8. после setMyCommands идут setMyDescription на ru и по умолчанию, затем setMyShortDescription на ru и по умолчанию", () => {
    expect(descriptionCalls()).toMatchObject([
      {
        method: "setMyDescription",
        body: { language_code: "ru", description: russianDescription },
      },
      { method: "setMyDescription", body: { description: englishDescription } },
      {
        method: "setMyShortDescription",
        body: { language_code: "ru", short_description: russianShortDescription },
      },
      { method: "setMyShortDescription", body: { short_description: englishShortDescription } },
    ]);
  });

  it.each([
    ["setMyDescription", 4],
    ["setMyShortDescription", 6],
  ])("8. второй %s без language_code", (_method, index) => {
    expect(callAt(index).body).not.toHaveProperty("language_code");
  });

  it("8. описания не длиннее 512 символов, короткие описания не длиннее 120", () => {
    const [ruDescription, enDescription, ruShort, enShort] = descriptionCalls();
    if (!ruDescription || !enDescription || !ruShort || !enShort) {
      throw new Error("botSetupCalls returned fewer than four description calls");
    }

    for (const call of [ruDescription, enDescription]) {
      expect(textField(call, "description").length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
    }
    for (const call of [ruShort, enShort]) {
      expect(textField(call, "short_description").length).toBeLessThanOrEqual(
        SHORT_DESCRIPTION_MAX_LENGTH,
      );
    }
  });
});
