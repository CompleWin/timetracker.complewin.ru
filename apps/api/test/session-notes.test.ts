import { describe, expect, it } from "vitest";
import { expectApiError, expectValidationError } from "./harness/assertions.ts";
import { atClock } from "./harness/clock.ts";
import {
  EVENING,
  MAX_NOTE_LENGTH,
  addSession,
  editSession,
  interval,
  requestAddSession,
  requestEditSession,
} from "./harness/manual-sessions.ts";
import {
  getActiveTimers,
  getTaskSessions,
  getTimerSession,
  loginWithTask,
  startTimer,
} from "./harness/timers.ts";

const NOTE = "повторил 50 карточек";
const NOTE_WITH_SPACES = "  повторил 50 карточек\n\n";
const LONGEST_NOTE = "я".repeat(MAX_NOTE_LENGTH);
const TOO_LONG_NOTE = "я".repeat(MAX_NOTE_LENGTH + 1);

describe("заметка сессии", () => {
  it("1. заметка меняется у идущей сессии", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atClock("10:00"));

    expect(
      await requestEditSession(session, running.id, { note: NOTE }, atClock("10:05")),
    ).toMatchObject({
      status: 200,
      body: {
        session: { id: running.id, startedAt: running.startedAt, endedAt: null, note: NOTE },
      },
    });
    expect(await getActiveTimers(session, atClock("10:06"))).toMatchObject({
      status: 200,
      body: { sessions: [{ id: running.id, endedAt: null, note: NOTE }] },
    });
  });

  it("1. заметка меняется у остановленной сессии", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);

    expect(await requestEditSession(session, stopped.id, { note: NOTE }, EVENING)).toMatchObject({
      status: 200,
      body: { session: { ...stopped, note: NOTE } },
    });
    expect(await getTaskSessions(session, task.id, {}, EVENING)).toMatchObject({
      status: 200,
      body: { sessions: [{ id: stopped.id, note: NOTE }] },
    });
  });

  it("1. у сессии таймера и у ручной сессии без заметки заметка пустая", async () => {
    const { session, task } = await loginWithTask();
    const manual = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);
    const running = await startTimer(session, task.id, EVENING);

    expect(manual).toMatchObject({ note: "" });
    expect(running).toMatchObject({ note: "" });
  });

  it("1. заметка хранится как есть, без обрезки пробелов", async () => {
    const { session, task } = await loginWithTask();
    const manual = await addSession(
      session,
      task.id,
      { ...interval("10:00", "10:40"), note: NOTE_WITH_SPACES },
      EVENING,
    );
    const running = await startTimer(session, task.id, EVENING);
    await editSession(session, running.id, { note: NOTE_WITH_SPACES }, EVENING);

    for (const { id } of [manual, running]) {
      expect(await getTimerSession(session, id, EVENING)).toMatchObject({
        status: 200,
        body: { session: { id, note: NOTE_WITH_SPACES } },
      });
    }
  });

  it("1. пустая строка очищает заметку", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await addSession(
      session,
      task.id,
      { ...interval("10:00", "10:40"), note: NOTE },
      EVENING,
    );

    expect(await requestEditSession(session, stopped.id, { note: "" }, EVENING)).toMatchObject({
      status: 200,
      body: { session: { id: stopped.id, note: "" } },
    });
  });

  it("1. заметка из 10 000 символов принимается в PATCH и в POST", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);

    expect(
      await requestEditSession(session, stopped.id, { note: LONGEST_NOTE }, EVENING),
    ).toMatchObject({ status: 200, body: { session: { note: LONGEST_NOTE } } });
    expect(
      await requestAddSession(
        session,
        task.id,
        { ...interval("11:00", "11:40"), note: LONGEST_NOTE },
        EVENING,
      ),
    ).toMatchObject({ status: 201, body: { session: { note: LONGEST_NOTE } } });
  });

  it("1. заметка из 10 001 символа в PATCH даёт 400 с полем note, заметка не меняется", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await addSession(
      session,
      task.id,
      { ...interval("10:00", "10:40"), note: NOTE },
      EVENING,
    );

    expectValidationError(
      await requestEditSession(session, stopped.id, { note: TOO_LONG_NOTE }, EVENING),
      ["note"],
    );
    expect(await getTimerSession(session, stopped.id, EVENING)).toMatchObject({
      status: 200,
      body: { session: { note: NOTE } },
    });
  });

  it("1. заметка из 10 001 символа в POST даёт 400 с полем note, сессия не создаётся", async () => {
    const { session, task } = await loginWithTask();
    const body = { ...interval("10:00", "10:40"), note: TOO_LONG_NOTE };

    expectValidationError(await requestAddSession(session, task.id, body, EVENING), ["note"]);
    expect(await getTaskSessions(session, task.id, {}, EVENING)).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
  });

  it("1. заметка не строкой даёт 400 с полем note", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);

    expectValidationError(await requestEditSession(session, stopped.id, { note: 50 }, EVENING), [
      "note",
    ]);
  });

  it.each([{}, { title: "Anki" }])(
    "1. PATCH /api/sessions/:id с телом %j без известных полей даёт 400 validation_error",
    async (body) => {
      const { session, task } = await loginWithTask();
      const stopped = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);

      expectApiError(
        await requestEditSession(session, stopped.id, body, EVENING),
        "validation_error",
      );
    },
  );
});
