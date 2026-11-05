import { beforeEach, describe, expect, it } from "vitest";
import { atMinute, atSecond } from "./harness/clock.ts";
import { api, runCron, type TestSession } from "./harness/index.ts";
import { requireStatus } from "./harness/rest.ts";
import { currentUser } from "./harness/session.ts";
import { createTask } from "./harness/tasks.ts";
import {
  callbackButton,
  fakeBot,
  loginWithBotAccess,
  loginWithoutBotAccess,
  only,
  pressButton,
  type BotUser,
  type FakeBot,
  type InlineButton,
  type Locale,
  type SentMessage,
} from "./harness/telegram-bot.ts";
import { getTimerSession, startTimer, stopTimer, type TestTimerSession } from "./harness/timers.ts";

type UserWithAnki = BotUser & {
  taskId: string;
  anki: TestTimerSession;
};

type ReminderButtons = {
  stop: string;
  snooze: string;
};

const RUSSIAN_BUTTONS: ReminderButtons = { stop: "⏹ Остановить", snooze: "Ещё работаю" };
const ENGLISH_BUTTONS: ReminderButtons = { stop: "⏹ Stop", snooze: "Still working" };
const SEVEN_TIMERS = 7;

let bot: FakeBot;

beforeEach(() => {
  bot = fakeBot();
});

async function startAnki(user: BotUser): Promise<UserWithAnki> {
  const task = await createTask(user.session, { title: "Anki" }, atSecond(0));
  return { ...user, taskId: task.id, anki: await startTimer(user.session, task.id, atSecond(0)) };
}

function botUserWithAnki(locale: Locale = "ru"): Promise<UserWithAnki> {
  return loginWithBotAccess(locale).then(startAnki);
}

async function remindersAt(minute: number): Promise<SentMessage[]> {
  bot.forget();
  await runCron(atMinute(minute).now);
  return bot.sentMessages();
}

async function setThreshold(session: TestSession, reminderThresholdMin: number): Promise<void> {
  const response = await api.patch(
    "/api/me",
    { reminderThresholdMin },
    { ...atSecond(0), as: session },
  );
  requireStatus(response, 200, "PATCH /api/me");
}

function stopButton(sessionId: string, buttons = RUSSIAN_BUTTONS): InlineButton {
  return callbackButton(buttons.stop, `stop:${sessionId}`);
}

function snoozeButton(sessionId: string, buttons = RUSSIAN_BUTTONS): InlineButton {
  return callbackButton(buttons.snooze, `snooze:${sessionId}`);
}

function reminderKeyboard(sessionId: string, buttons = RUSSIAN_BUTTONS): InlineButton[][] {
  return [[stopButton(sessionId, buttons)], [snoozeButton(sessionId, buttons)]];
}

function russianReminder(clock: string): string {
  return `⏰ «Anki» идёт уже ${clock}. Остановить?`;
}

describe("когда приходит напоминание", () => {
  it("16. таймер идёт 2 ч 59 мин: cron ничего не отправляет", async () => {
    await botUserWithAnki();

    expect(await remindersAt(179)).toEqual([]);
  });

  it("16. таймер идёт 3 ч 0 мин: один sendMessage с текстом и кнопками stop и snooze, каждая в своём ряду", async () => {
    const { sender, anki } = await botUserWithAnki();

    expect(await remindersAt(180)).toMatchObject([
      {
        chatId: String(sender.telegramId),
        text: russianReminder("3:00:00"),
        keyboard: reminderKeyboard(anki.id),
      },
    ]);
  });

  it("17. через минуту после напоминания второго нет, через 3 часа после первого приходит", async () => {
    const { anki } = await botUserWithAnki();
    await remindersAt(180);

    expect(await remindersAt(181)).toEqual([]);
    expect(await remindersAt(359)).toEqual([]);
    expect(await remindersAt(360)).toMatchObject([
      { text: russianReminder("6:00:00"), keyboard: reminderKeyboard(anki.id) },
    ]);
  });

  it("18. при botCanMessage = false напоминаний нет", async () => {
    await loginWithoutBotAccess(2002).then(startAnki);

    expect(await remindersAt(180)).toEqual([]);
  });

  it("18. при пороге 0 напоминаний нет", async () => {
    const { session } = await botUserWithAnki();
    await setThreshold(session, 0);

    expect(await remindersAt(180)).toEqual([]);
    expect(await remindersAt(24 * 60)).toEqual([]);
  });

  it("21. семь подходящих таймеров у одного пользователя: первый cron отправляет 5 напоминаний, следующий 2", async () => {
    const user = await loginWithBotAccess();
    const running: TestTimerSession[] = [];
    for (let index = 1; index <= SEVEN_TIMERS; index++) {
      const task = await createTask(user.session, { title: `Задача ${index}` }, atSecond(0));
      running.push(await startTimer(user.session, task.id, atSecond(index)));
    }

    const first = await remindersAt(181);
    const second = await remindersAt(182);

    expect(first).toHaveLength(5);
    expect(second).toHaveLength(2);
    expect([...first, ...second].map((reminder) => reminder.keyboard)).toEqual(
      expect.arrayContaining(running.map((session) => reminderKeyboard(session.id))),
    );
  });

  it("23. остановленная сессия больше не напоминает о себе", async () => {
    const { session, taskId } = await botUserWithAnki();
    await remindersAt(180);
    await stopTimer(session, taskId, atMinute(200));

    expect(await remindersAt(360)).toEqual([]);
  });
});

describe("ошибки отправки напоминания", () => {
  it.each([429, 500])("22. ответ %i: следующий cron повторяет отправку", async (status) => {
    const { anki } = await botUserWithAnki();
    bot.failWith("sendMessage", status);
    expect(await remindersAt(180)).toHaveLength(1);
    bot.recover("sendMessage");

    expect(await remindersAt(181)).toMatchObject([{ keyboard: reminderKeyboard(anki.id) }]);
  });

  it("22. ответ 403: botCanMessage = false, повтора нет", async () => {
    const { session } = await botUserWithAnki();
    bot.failWith("sendMessage", 403);
    expect(await remindersAt(180)).toHaveLength(1);
    bot.recover("sendMessage");

    expect(await currentUser(session)).toMatchObject({ botCanMessage: false });
    expect(await remindersAt(181)).toEqual([]);
  });
});

describe("кнопки напоминания", () => {
  it("19. «Ещё работаю» отвечает «Хорошо, напомню через 3 ч», убирает клавиатуру и откладывает напоминание на 3 часа от нажатия", async () => {
    const { sender, anki } = await botUserWithAnki();
    const reminder = only(await remindersAt(180));

    const press = await pressButton(sender, reminder, `snooze:${anki.id}`, atMinute(200));

    expect(press.response.status).toBe(200);
    expect(bot.callbackAnswers()).toEqual([
      { queryId: press.queryId, text: "Хорошо, напомню через 3 ч" },
    ]);
    expect(bot.markupEdits()).toEqual([
      { chatId: reminder.chatId, messageId: reminder.messageId, buttons: [] },
    ]);
    expect(await remindersAt(379)).toEqual([]);
    expect(await remindersAt(380)).toMatchObject([{ keyboard: reminderKeyboard(anki.id) }]);
  });

  it("20. «⏹ Остановить» из напоминания останавливает таймер, как в критерии 6", async () => {
    const { session, sender, anki } = await botUserWithAnki();
    const reminder = only(await remindersAt(180));

    const press = await pressButton(sender, reminder, `stop:${anki.id}`, atMinute(180));

    expect(press.response.status).toBe(200);
    expect(await getTimerSession(session, anki.id)).toMatchObject({
      status: 200,
      body: { session: { endedAt: atMinute(180).now, durationSec: 3 * 60 * 60 } },
    });
    expect(bot.callbackAnswers()).toEqual([
      { queryId: press.queryId, text: "Остановлено: Anki — 3:00:00" },
    ]);
    expect(bot.markupEdits()).toEqual([
      { chatId: reminder.chatId, messageId: reminder.messageId, buttons: [snoozeButton(anki.id)] },
    ]);
  });

  it("24. пользователь с locale en получает напоминание и ответ «Still working» по-английски", async () => {
    const { sender, anki } = await botUserWithAnki("en");
    const reminder = only(await remindersAt(180));

    expect(reminder).toMatchObject({
      text: '⏰ "Anki" has been running for 3:00:00. Stop it?',
      keyboard: reminderKeyboard(anki.id, ENGLISH_BUTTONS),
    });

    const press = await pressButton(sender, reminder, `snooze:${anki.id}`, atMinute(200));

    expect(bot.callbackAnswers()).toEqual([
      { queryId: press.queryId, text: "OK, I'll remind you in 3 h" },
    ]);
  });
});
