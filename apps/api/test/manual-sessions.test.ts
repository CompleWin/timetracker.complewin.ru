import { describe, expect, it } from "vitest";
import { expectApiError, expectValidationError } from "./harness/assertions.ts";
import { atClock, atSecond, clockIso } from "./harness/clock.ts";
import type { TestSession } from "./harness/index.ts";
import {
  EVENING,
  addSession,
  expectTaskSessionIds,
  interval,
  requestAddSession,
  requestDeleteSession,
  requestEditSession,
} from "./harness/manual-sessions.ts";
import { archiveProject, createProject } from "./harness/projects.ts";
import type { SessionOpts } from "./harness/rest.ts";
import { UUID, loginAs } from "./harness/session.ts";
import { archiveTask, createTask, getTask } from "./harness/tasks.ts";
import { getTimerSession, loginWithTask, recordSession } from "./harness/timers.ts";

const NOTE = "повторил 50 карточек";

async function expectNotCreated(session: TestSession, taskId: string): Promise<void> {
  await expectTaskSessionIds(session, taskId, [], EVENING);
}

async function addAndExpectRejected(
  body: unknown,
  opts: SessionOpts,
  fields: string[],
): Promise<void> {
  const { session, task } = await loginWithTask();

  expectValidationError(await requestAddSession(session, task.id, body, opts), fields);
  await expectNotCreated(session, task.id);
}

describe("POST /api/tasks/:id/sessions", () => {
  it("2. ручная сессия 10:00–10:40 создаётся с durationSec 2400", async () => {
    const { session, task } = await loginWithTask();

    expect(
      await requestAddSession(session, task.id, interval("10:00", "10:40"), EVENING),
    ).toMatchObject({
      status: 201,
      body: {
        session: {
          id: expect.stringMatching(UUID),
          taskId: task.id,
          startedAt: clockIso("10:00"),
          endedAt: clockIso("10:40"),
          durationSec: 2400,
          note: "",
        },
      },
    });
  });

  it("2. ручная сессия попадает в totalSec задачи вместе с сессиями таймера", async () => {
    const { session, task } = await loginWithTask();
    await recordSession(session, task.id, 0, 60);

    await addSession(session, task.id, interval("10:00", "10:40"), EVENING);

    expect(await getTask(session, task.id, EVENING)).toMatchObject({
      status: 200,
      body: { task: { totalSec: 60 + 2400, runningSessionId: null } },
    });
  });

  it("2. созданная сессия с заметкой видна по GET /api/sessions/:id и в списке сессий задачи", async () => {
    const { session, task } = await loginWithTask();

    const created = await addSession(
      session,
      task.id,
      { ...interval("10:00", "10:40"), note: NOTE },
      EVENING,
    );

    expect(created).toMatchObject({ note: NOTE });
    expect(await getTimerSession(session, created.id, EVENING)).toMatchObject({
      status: 200,
      body: { session: created },
    });
    await expectTaskSessionIds(session, task.id, [created], EVENING);
  });

  it("2. время со смещением нормализуется в UTC", async () => {
    const { session, task } = await loginWithTask();
    const body = {
      startedAt: "2030-01-01T13:00:00+03:00",
      endedAt: "2030-01-01T13:40:00.000+03:00",
    };

    expect(await requestAddSession(session, task.id, body, EVENING)).toMatchObject({
      status: 201,
      body: {
        session: { startedAt: clockIso("10:00"), endedAt: clockIso("10:40"), durationSec: 2400 },
      },
    });
  });
});

describe("время ручной сессии", () => {
  it("3. конец позже «сейчас» даёт 400 с полем endedAt", async () => {
    await addAndExpectRejected(interval("10:00", "10:40"), atClock("10:30"), ["endedAt"]);
  });

  it("3. конец, равный «сейчас», принимается", async () => {
    const { session, task } = await loginWithTask();

    expect(
      await requestAddSession(session, task.id, interval("10:00", "10:40"), atClock("10:40")),
    ).toMatchObject({ status: 201, body: { session: { durationSec: 2400 } } });
  });

  it("3. начало позже «сейчас» даёт 400 с полем startedAt", async () => {
    await addAndExpectRejected(interval("11:00", "11:30"), atClock("10:30"), ["startedAt"]);
  });

  it.each([
    ["равен началу", "10:00", "10:00"],
    ["раньше начала", "10:40", "10:00"],
  ])("3. конец %s даёт 400 с полем endedAt", async (_, start, end) => {
    await addAndExpectRejected(interval(start, end), EVENING, ["endedAt"]);
  });

  it.each([
    ["startedAt", { endedAt: clockIso("10:40") }],
    ["endedAt", { startedAt: clockIso("10:00") }],
  ])("3. без %s ответ 400 с этим полем", async (field, body) => {
    await addAndExpectRejected(body, EVENING, [field]);
  });

  it("3. endedAt null даёт 400 с полем endedAt", async () => {
    await addAndExpectRejected({ startedAt: clockIso("10:00"), endedAt: null }, EVENING, [
      "endedAt",
    ]);
  });

  it("3. startedAt не в формате ISO даёт 400 с полем startedAt", async () => {
    await addAndExpectRejected({ startedAt: "вчера", endedAt: clockIso("10:40") }, EVENING, [
      "startedAt",
    ]);
  });
});

describe("ручная сессия у неактивной задачи", () => {
  it("10. у архивной задачи даёт 409 task_archived", async () => {
    const { session, task } = await loginWithTask();
    await archiveTask(session, task.id, atClock("09:00"));

    expectApiError(
      await requestAddSession(session, task.id, interval("10:00", "10:40"), EVENING),
      "task_archived",
    );
    await expectNotCreated(session, task.id);
  });

  it("10. у задачи архивного проекта даёт 409 task_archived", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const run = await createTask(session, { title: "Бег", projectId: sport.id }, atSecond(0));
    await archiveProject(session, sport.id, atClock("09:00"));

    expectApiError(
      await requestAddSession(session, run.id, interval("10:00", "10:40"), EVENING),
      "task_archived",
    );
    await expectNotCreated(session, run.id);
  });

  it("10. сессии архивной задачи можно править и удалять", async () => {
    const { session, task } = await loginWithTask();
    const edited = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);
    const removed = await addSession(session, task.id, interval("11:00", "11:40"), EVENING);
    await archiveTask(session, task.id, EVENING);

    expect(
      await requestEditSession(
        session,
        edited.id,
        { note: NOTE, endedAt: clockIso("10:30") },
        EVENING,
      ),
    ).toMatchObject({
      status: 200,
      body: { session: { id: edited.id, note: NOTE, durationSec: 1800 } },
    });
    expect(await requestDeleteSession(session, removed.id, EVENING)).toMatchObject({
      status: 204,
    });
    await expectTaskSessionIds(session, task.id, [edited], EVENING);
  });
});
