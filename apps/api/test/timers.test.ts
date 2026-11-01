import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { atSecond } from "./harness/clock.ts";
import type { TestResponse, TestSession } from "./harness/index.ts";
import { createProject } from "./harness/projects.ts";
import type { SessionOpts } from "./harness/rest.ts";
import { UUID, loginAs } from "./harness/session.ts";
import { createTask, getTask, type TestTask } from "./harness/tasks.ts";
import {
  MAX_RUNNING_TIMERS,
  getActiveTimers,
  getTimerSession,
  loginWithTask,
  requestStart,
  requestStopSession,
  requestStopTask,
  startTimer,
  stopTimer,
  type TestTimerSession,
} from "./harness/timers.ts";

type RunningTask = {
  task: TestTask;
  running: TestTimerSession;
};

type StopRequest = (
  session: TestSession,
  target: RunningTask,
  opts: SessionOpts,
) => Promise<TestResponse>;

const stopWays: [string, StopRequest][] = [
  [
    "POST /api/tasks/:id/stop",
    (session, { task }, opts) => requestStopTask(session, task.id, opts),
  ],
  [
    "POST /api/sessions/:id/stop",
    (session, { running }, opts) => requestStopSession(session, running.id, opts),
  ],
];

const CONCURRENT_STARTS = 5;

async function startTimersOnNewTasks(session: TestSession, count: number): Promise<void> {
  for (let index = 1; index <= count; index++) {
    const task = await createTask(session, { title: `Задача ${index}` }, atSecond(0));
    await startTimer(session, task.id, atSecond(index));
  }
}

describe("POST /api/tasks/:id/start", () => {
  it("4. запуск с X-Test-Now T возвращает 201, startedAt = T, endedAt = null", async () => {
    const { session, task } = await loginWithTask();

    expect(await requestStart(session, task.id, atSecond(10))).toMatchObject({
      status: 201,
      body: {
        session: {
          id: expect.stringMatching(UUID),
          taskId: task.id,
          startedAt: atSecond(10).now,
          endedAt: null,
          durationSec: 0,
        },
      },
    });
  });

  it("4. X-Test-Now со смещением нормализуется в startedAt", async () => {
    const { session, task } = await loginWithTask();

    expect(
      await requestStart(session, task.id, { now: "2030-01-01T03:00:10+03:00" }),
    ).toMatchObject({
      status: 201,
      body: { session: { startedAt: "2030-01-01T00:00:10.000Z" } },
    });
  });

  it("4. у задачи появляется runningSessionId идущей сессии", async () => {
    const { session, task } = await loginWithTask();
    expect(await getTask(session, task.id, atSecond(5))).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: null, totalSec: 0 } },
    });

    const running = await startTimer(session, task.id, atSecond(10));

    expect(await getTask(session, task.id, atSecond(10))).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: running.id } },
    });
  });

  it("4. запущенная сессия возвращается по GET /api/sessions/:id", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atSecond(10));

    expect(await getTimerSession(session, running.id, atSecond(10))).toMatchObject({
      status: 200,
      body: { session: running },
    });
  });

  it("5. повторный запуск той же задачи даёт 409 already_running с details.sessionId", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atSecond(0));

    const response = await requestStart(session, task.id, atSecond(5));

    expectApiError(response, "already_running");
    expect(response.body).toMatchObject({ error: { details: { sessionId: running.id } } });
  });

  it("7. пять одновременных запусков одной задачи дают ровно один ответ 201", async () => {
    const { session, task } = await loginWithTask();

    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_STARTS }, () => requestStart(session, task.id, atSecond(10))),
    );

    const created = responses.filter((response) => response.status === 201);
    const rejected = responses.filter((response) => response.status !== 201);
    expect(created).toHaveLength(1);
    for (const response of rejected) expectApiError(response, "already_running");
    expect(await getActiveTimers(session, atSecond(11))).toMatchObject({
      status: 200,
      body: { sessions: [{ taskId: task.id }] },
    });
  });

  it("14. 21-й одновременный таймер даёт 409 too_many_running", async () => {
    const { session } = await loginAs({}, atSecond(0));
    await startTimersOnNewTasks(session, MAX_RUNNING_TIMERS);
    const extra = await createTask(session, { title: "Лишняя" }, atSecond(0));

    expectApiError(await requestStart(session, extra.id, atSecond(30)), "too_many_running");
    expect(await getTask(session, extra.id, atSecond(30))).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: null } },
    });
  });

  it("14. после остановки одного из 20 таймеров следующий запускается", async () => {
    const { session, task: first } = await loginWithTask("Первая");
    await startTimer(session, first.id, atSecond(0));
    await startTimersOnNewTasks(session, MAX_RUNNING_TIMERS - 1);
    const extra = await createTask(session, { title: "Лишняя" }, atSecond(0));
    await stopTimer(session, first.id, atSecond(30));

    expect(await requestStart(session, extra.id, atSecond(40))).toMatchObject({ status: 201 });
  });
});

describe("GET /api/timers/active", () => {
  it("6. возвращает сессии двух задач по порядку запуска, с task", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const treadmill = await createTask(
      session,
      { title: "Беговая дорожка", projectId: sport.id },
      atSecond(0),
    );
    const anki = await createTask(session, { title: "Anki" }, atSecond(0));
    const first = await startTimer(session, treadmill.id, atSecond(10));
    const second = await startTimer(session, anki.id, atSecond(20));

    expect(await getActiveTimers(session, atSecond(30))).toMatchObject({
      status: 200,
      body: {
        sessions: [
          {
            ...first,
            durationSec: 20,
            task: { id: treadmill.id, title: "Беговая дорожка", projectId: sport.id },
          },
          {
            ...second,
            durationSec: 10,
            task: { id: anki.id, title: "Anki", projectId: null },
          },
        ],
      },
    });
  });

  it("6. сессии с одинаковым startedAt идут по id", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const anki = await createTask(session, { title: "Anki" }, atSecond(0));
    const treadmill = await createTask(session, { title: "Беговая дорожка" }, atSecond(0));
    const sameStart = atSecond(10);
    const ids = [
      (await startTimer(session, anki.id, sameStart)).id,
      (await startTimer(session, treadmill.id, sameStart)).id,
    ].sort();

    expect(await getActiveTimers(session, atSecond(20))).toMatchObject({
      status: 200,
      body: { sessions: ids.map((id) => ({ id })) },
    });
  });

  it("6. остановленный таймер в список не попадает", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const anki = await createTask(session, { title: "Anki" }, atSecond(0));
    const treadmill = await createTask(session, { title: "Беговая дорожка" }, atSecond(0));
    await startTimer(session, anki.id, atSecond(10));
    const running = await startTimer(session, treadmill.id, atSecond(20));
    await stopTimer(session, anki.id, atSecond(30));

    expect(await getActiveTimers(session, atSecond(40))).toMatchObject({
      status: 200,
      body: { sessions: [{ id: running.id, task: { title: "Беговая дорожка" } }] },
    });
  });
});

describe("остановка таймера", () => {
  it.each(stopWays)(
    "8. %s через 90 секунд даёт durationSec 90 и totalSec задачи 90",
    async (_, stop) => {
      const { session, task } = await loginWithTask();
      const running = await startTimer(session, task.id, atSecond(0));

      expect(await stop(session, { task, running }, atSecond(90))).toMatchObject({
        status: 200,
        body: {
          session: {
            id: running.id,
            taskId: task.id,
            startedAt: running.startedAt,
            endedAt: atSecond(90).now,
            durationSec: 90,
          },
        },
      });
      expect(await getTask(session, task.id, atSecond(100))).toMatchObject({
        status: 200,
        body: { task: { totalSec: 90, runningSessionId: null } },
      });
    },
  );

  it("8. длительность округляется вниз до целых секунд", async () => {
    const { session, task } = await loginWithTask();
    await startTimer(session, task.id, atSecond(0));

    expect(await requestStopTask(session, task.id, atSecond(90.999))).toMatchObject({
      status: 200,
      body: { session: { endedAt: "2030-01-01T00:01:30.999Z", durationSec: 90 } },
    });
  });

  it("8. остановленная сессия по GET /api/sessions/:id сохраняет endedAt и durationSec", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atSecond(0));
    const stopped = await stopTimer(session, task.id, atSecond(90));

    expect(await getTimerSession(session, running.id, atSecond(500))).toMatchObject({
      status: 200,
      body: { session: stopped },
    });
  });

  it("9. остановка задачи без таймера даёт 409 not_running", async () => {
    const { session, task } = await loginWithTask();

    expectApiError(await requestStopTask(session, task.id, atSecond(10)), "not_running");
  });

  it("9. повторная остановка сессии по ID даёт 409 not_running", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atSecond(0));
    expect(await requestStopSession(session, running.id, atSecond(60))).toMatchObject({
      status: 200,
    });

    expectApiError(await requestStopSession(session, running.id, atSecond(70)), "not_running");
  });

  it("9. остановка задачи, чей таймер уже остановлен, даёт 409 not_running", async () => {
    const { session, task } = await loginWithTask();
    await startTimer(session, task.id, atSecond(0));
    await stopTimer(session, task.id, atSecond(60));

    expectApiError(await requestStopTask(session, task.id, atSecond(70)), "not_running");
  });

  it.each(stopWays)(
    "17. %s с X-Test-Now раньше startedAt даёт durationSec 0 и endedAt = startedAt",
    async (_, stop) => {
      const { session, task } = await loginWithTask();
      const running = await startTimer(session, task.id, atSecond(100));

      expect(await stop(session, { task, running }, atSecond(40))).toMatchObject({
        status: 200,
        body: {
          session: {
            id: running.id,
            startedAt: running.startedAt,
            endedAt: running.startedAt,
            durationSec: 0,
          },
        },
      });
      expect(await getTask(session, task.id, atSecond(200))).toMatchObject({
        status: 200,
        body: { task: { totalSec: 0, runningSessionId: null } },
      });
    },
  );
});
