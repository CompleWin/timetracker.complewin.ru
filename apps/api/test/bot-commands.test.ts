import { beforeEach, describe, expect, it } from "vitest";
import { atSecond } from "./harness/clock.ts";
import { testEnv, type TestSession } from "./harness/index.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { currentUser } from "./harness/session.ts";
import { createTask } from "./harness/tasks.ts";
import {
  buttonsOf,
  callbackButton,
  fakeBot,
  loginWithoutBotAccess,
  messageWithButton,
  only,
  pressButton,
  sendText,
  textLines,
  type FakeBot,
  type InlineButton,
  type Sender,
  type SentMessage,
} from "./harness/telegram-bot.ts";
import { getTimerSession, startTimer, type TestTimerSession } from "./harness/timers.ts";

type TwoTimers = {
  anki: TestTimerSession;
  treadmill: TestTimerSession;
};

const IVAN = 2002;
const STRANGER = 3003;
const UNKNOWN = 4004;

const TREADMILL_STARTED_AT = atSecond(27 * 60 + 10);
const STATUS_AT = atSecond(42 * 60 + 10);

const GREETING_RU =
  "Готово! Буду напоминать о таймерах, которые идут слишком долго. Команды: /status — что идёт, /stop — остановить.";
const SIGN_IN_FIRST_RU = "Сначала войди в трекер через Telegram, потом возвращайся сюда.";
const SIGN_IN_FIRST_EN = "Sign in to the tracker with Telegram first, then come back here.";
const ALREADY_STOPPED = "Этот таймер уже остановлен";

let bot: FakeBot;

beforeEach(() => {
  bot = fakeBot();
});

function trackerLink(text: string): InlineButton {
  return { text, url: testEnv.APP_URL };
}

function stopButton(title: string, sessionId: string): InlineButton {
  return callbackButton(`⏹ ${title}`, `stop:${sessionId}`);
}

async function startTask(
  session: TestSession,
  title: string,
  startedAt = atSecond(0),
): Promise<TestTimerSession> {
  const task = await createTask(session, { title }, atSecond(0));
  return startTimer(session, task.id, startedAt);
}

async function startTwoTimers(session: TestSession): Promise<TwoTimers> {
  return {
    anki: await startTask(session, "Anki"),
    treadmill: await startTask(session, "Беговая дорожка", TREADMILL_STARTED_AT),
  };
}

async function reply(sender: Sender, text: string, now = STATUS_AT): Promise<SentMessage> {
  bot.forget();
  await sendText(sender, text, now);
  return only(bot.sentMessages());
}

describe("/start", () => {
  it("2. от известного пользователя: приветствие в его чат с кнопкой-ссылкой на APP_URL, botCanMessage = true", async () => {
    const { session, sender } = await loginWithoutBotAccess(IVAN);

    const response = await sendText(sender, "/start");

    expect(response.status).toBe(200);
    const greeting = only(bot.sentMessages());
    expect(greeting).toMatchObject({ chatId: String(IVAN), text: GREETING_RU });
    expect(buttonsOf(greeting)).toEqual([trackerLink("Открыть трекер")]);
    expect(await currentUser(session)).toMatchObject({ botCanMessage: true });
  });
});

describe("неизвестный пользователь", () => {
  it.each(["/start", "/status", "привет"])(
    "3. на «%s» отвечает «Сначала войди в трекер…» с кнопкой-ссылкой на APP_URL",
    async (text) => {
      const answer = await reply({ telegramId: UNKNOWN, languageCode: "ru" }, text);

      expect(answer).toMatchObject({ chatId: String(UNKNOWN), text: SIGN_IN_FIRST_RU });
      expect(buttonsOf(answer)).toEqual([trackerLink("Открыть трекер")]);
    },
  );

  it.each([
    ["en", SIGN_IN_FIRST_EN],
    ["de", SIGN_IN_FIRST_EN],
    ["ru", SIGN_IN_FIRST_RU],
    ["ru-RU", SIGN_IN_FIRST_RU],
  ])("13. с language_code %s получает «%s»", async (languageCode, text) => {
    const answer = await reply({ telegramId: UNKNOWN, languageCode }, "/status");

    expect(answer.text).toBe(text);
  });

  it("13. с language_code en получает кнопку «Open tracker»", async () => {
    const answer = await reply({ telegramId: UNKNOWN, languageCode: "en" }, "/start");

    expect(buttonsOf(answer)).toEqual([trackerLink("Open tracker")]);
  });
});

describe("/status и /stop", () => {
  it.each(["/status", "/stop"])("4. %s без таймеров: «Сейчас ничего не идёт.»", async (command) => {
    const { sender } = await loginWithoutBotAccess(IVAN);

    const answer = await reply(sender, command);

    expect(answer).toMatchObject({ chatId: String(IVAN), text: "Сейчас ничего не идёт." });
  });

  it("13. пользователь с locale en на /status без таймеров получает «Nothing is running right now.»", async () => {
    const { sender } = await loginWithoutBotAccess(IVAN, "en");

    const answer = await reply({ ...sender, languageCode: "ru" }, "/status");

    expect(answer.text).toBe("Nothing is running right now.");
  });

  it("5. /status при Anki 42:10 и Беговой дорожке 15:00: строки по startedAt и кнопки stop:<id>", async () => {
    const { session, sender } = await loginWithoutBotAccess(IVAN);
    const { anki, treadmill } = await startTwoTimers(session);

    const status = await reply(sender, "/status");

    expect(status.chatId).toBe(String(IVAN));
    expect(textLines(status)).toEqual([
      "Сейчас идёт:",
      "▶ Anki — 0:42:10",
      "▶ Беговая дорожка — 0:15:00",
    ]);
    expect(buttonsOf(status)).toEqual([
      stopButton("Anki", anki.id),
      stopButton("Беговая дорожка", treadmill.id),
    ]);
  });

  it("5. /stop при двух таймерах: «Что остановить?» и кнопки stop:<id> по startedAt", async () => {
    const { session, sender } = await loginWithoutBotAccess(IVAN);
    const { anki, treadmill } = await startTwoTimers(session);

    const question = await reply(sender, "/stop");

    expect(question.text).toBe("Что остановить?");
    expect(buttonsOf(question)).toEqual([
      stopButton("Anki", anki.id),
      stopButton("Беговая дорожка", treadmill.id),
    ]);
  });
});

describe("кнопка stop:<sessionId>", () => {
  it("6. останавливает идущую сессию, отвечает «Остановлено: Anki — 0:42:10» и оставляет в сообщении вторую кнопку", async () => {
    const { session, sender } = await loginWithoutBotAccess(IVAN);
    const { anki, treadmill } = await startTwoTimers(session);
    const status = await reply(sender, "/status");

    const press = await pressButton(sender, status, `stop:${anki.id}`, STATUS_AT);

    expect(press.response.status).toBe(200);
    expect(await getTimerSession(session, anki.id)).toMatchObject({
      status: 200,
      body: { session: { endedAt: STATUS_AT.now, durationSec: 42 * 60 + 10 } },
    });
    expect(bot.callbackAnswers()).toEqual([
      { queryId: press.queryId, text: "Остановлено: Anki — 0:42:10" },
    ]);
    expect(bot.markupEdits()).toEqual([
      {
        chatId: String(IVAN),
        messageId: status.messageId,
        buttons: [stopButton("Беговая дорожка", treadmill.id)],
      },
    ]);
  });

  it("7. повторное нажатие той же кнопки отвечает «Этот таймер уже остановлен»", async () => {
    const { session, sender } = await loginWithoutBotAccess(IVAN);
    const { anki } = await startTwoTimers(session);
    const status = await reply(sender, "/status");
    await pressButton(sender, status, `stop:${anki.id}`, STATUS_AT);

    const repeat = await pressButton(sender, status, `stop:${anki.id}`, STATUS_AT);

    expect(repeat.response.status).toBe(200);
    expect(bot.callbackAnswers().at(-1)).toEqual({
      queryId: repeat.queryId,
      text: ALREADY_STOPPED,
    });
  });

  it("7. сессия чужого пользователя: «Этот таймер уже остановлен», сессия не меняется", async () => {
    const stranger = await loginWithoutBotAccess(STRANGER);
    const foreign = await startTask(stranger.session, "Чужая задача");
    const { sender } = await loginWithoutBotAccess(IVAN);
    const message = messageWithButton(sender, stopButton("Чужая задача", foreign.id));

    const press = await pressButton(sender, message, `stop:${foreign.id}`, STATUS_AT);

    expect(bot.callbackAnswers()).toEqual([{ queryId: press.queryId, text: ALREADY_STOPPED }]);
    expect(await getTimerSession(stranger.session, foreign.id, STATUS_AT)).toMatchObject({
      status: 200,
      body: { session: { endedAt: null } },
    });
  });

  it("7. несуществующая сессия: «Этот таймер уже остановлен»", async () => {
    const { sender } = await loginWithoutBotAccess(IVAN);
    const message = messageWithButton(sender, stopButton("Anki", MISSING_ID));

    const press = await pressButton(sender, message, `stop:${MISSING_ID}`, STATUS_AT);

    expect(bot.callbackAnswers()).toEqual([{ queryId: press.queryId, text: ALREADY_STOPPED }]);
  });
});
