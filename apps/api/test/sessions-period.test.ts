import { describe, expect, it } from "vitest";
import { expectApiError, expectValidationError } from "./harness/assertions.ts";
import { atClock, atSecond, clockIso } from "./harness/clock.ts";
import { api, type TestSession } from "./harness/index.ts";
import { EVENING, addSession, interval, type SessionInterval } from "./harness/manual-sessions.ts";
import { MAX_PERIOD_SEC, listSessions, periodFrom } from "./harness/period-sessions.ts";
import { archiveProject, createProject } from "./harness/projects.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";
import { archiveTask, createTask } from "./harness/tasks.ts";
import { startTimer, type TestTimerSession } from "./harness/timers.ts";

const PERIOD = { from: clockIso("10:00"), to: clockIso("12:00") };
const JUST_BEFORE_FROM = "2030-01-01T09:59:59.999Z";
const DAY_START = "2030-01-01T00:00:00.000Z";

async function owner(telegramId = 1): Promise<TestSession> {
  const { session } = await loginAs({ telegramId }, atSecond(0));
  return session;
}

async function sessionInNewTask(
  session: TestSession,
  title: string,
  times: SessionInterval,
): Promise<TestTimerSession> {
  const task = await createTask(session, { title }, atSecond(0));
  return addSession(session, task.id, times, EVENING);
}

function ids(sessions: TestTimerSession[]): { id: string }[] {
  return sessions.map(({ id }) => ({ id }));
}

describe("GET /api/sessions: границы периода", () => {
  it("1. из сессий, начатых в from, за 1 мс до from и в to, возвращается только первая", async () => {
    const session = await owner();
    const atFrom = await sessionInNewTask(session, "В начале", interval("10:00", "10:30"));
    await sessionInNewTask(session, "Чуть раньше", {
      startedAt: JUST_BEFORE_FROM,
      endedAt: clockIso("10:00"),
    });
    await sessionInNewTask(session, "В конце", interval("12:00", "12:30"));

    expect(await listSessions(session, PERIOD, EVENING)).toMatchObject({
      status: 200,
      body: { sessions: ids([atFrom]) },
    });
  });

  it("1. сессия, начатая до from и законченная после него, не возвращается", async () => {
    const session = await owner();
    await sessionInNewTask(session, "Через from", interval("09:00", "11:00"));
    const inside = await sessionInNewTask(session, "Внутри", interval("10:30", "11:30"));

    expect(await listSessions(session, PERIOD, EVENING)).toMatchObject({
      status: 200,
      body: { sessions: ids([inside]) },
    });
  });

  it("1. у сессии есть task { id, title, projectId }", async () => {
    const session = await owner();
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const run = await createTask(session, { title: "Бег", projectId: sport.id }, atSecond(0));
    const stored = await addSession(session, run.id, interval("10:00", "10:40"), EVENING);

    expect(await listSessions(session, PERIOD, EVENING)).toMatchObject({
      status: 200,
      body: {
        sessions: [{ ...stored, task: { id: run.id, title: "Бег", projectId: sport.id } }],
      },
    });
  });

  it("1. сессии идут по startedAt, при равном startedAt по id", async () => {
    const session = await owner();
    const late = await sessionInNewTask(session, "Поздняя", interval("11:00", "11:30"));
    const early = await sessionInNewTask(session, "Ранняя", interval("10:00", "10:20"));
    const sameStartIds = [
      (await sessionInNewTask(session, "Первая из равных", interval("10:30", "10:40"))).id,
      (await sessionInNewTask(session, "Вторая из равных", interval("10:30", "10:50"))).id,
    ].sort();

    expect(await listSessions(session, PERIOD, EVENING)).toMatchObject({
      status: 200,
      body: {
        sessions: [{ id: early.id }, ...sameStartIds.map((id) => ({ id })), { id: late.id }],
      },
    });
  });
});

describe("GET /api/sessions: состояние сессий и задач", () => {
  it("2. сессии архивной задачи и задачи архивного проекта возвращаются", async () => {
    const session = await owner();
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const run = await createTask(session, { title: "Бег", projectId: sport.id }, atSecond(0));
    const anki = await createTask(session, { title: "Anki" }, atSecond(0));
    const ofArchivedProject = await addSession(
      session,
      run.id,
      interval("10:00", "10:30"),
      EVENING,
    );
    const ofArchivedTask = await addSession(session, anki.id, interval("11:00", "11:30"), EVENING);
    await archiveProject(session, sport.id, EVENING);
    await archiveTask(session, anki.id, EVENING);

    expect(await listSessions(session, PERIOD, EVENING)).toMatchObject({
      status: 200,
      body: { sessions: ids([ofArchivedProject, ofArchivedTask]) },
    });
  });

  it("2. идущая сессия возвращается с endedAt null и durationSec на «сейчас» запроса", async () => {
    const session = await owner();
    const anki = await createTask(session, { title: "Anki" }, atSecond(0));
    const running = await startTimer(session, anki.id, atClock("11:00"));

    expect(await listSessions(session, PERIOD, atClock("11:30"))).toMatchObject({
      status: 200,
      body: {
        sessions: [
          {
            id: running.id,
            startedAt: clockIso("11:00"),
            endedAt: null,
            durationSec: 1800,
            task: { id: anki.id, title: "Anki", projectId: null },
          },
        ],
      },
    });
  });
});

describe("GET /api/sessions: taskId и чужие сессии", () => {
  it("3. taskId оставляет сессии одной задачи", async () => {
    const session = await owner();
    const anki = await createTask(session, { title: "Anki" }, atSecond(0));
    const ankiSession = await addSession(session, anki.id, interval("10:00", "10:30"), EVENING);
    await sessionInNewTask(session, "Бег", interval("10:15", "10:45"));

    expect(await listSessions(session, { ...PERIOD, taskId: anki.id }, EVENING)).toMatchObject({
      status: 200,
      body: { sessions: ids([ankiSession]) },
    });
  });

  it.each([
    ["несуществующей задачи", () => Promise.resolve(MISSING_ID)],
    ["не UUID", () => Promise.resolve("not-a-uuid")],
    [
      "чужой задачи",
      async () => {
        const stranger = await owner(2);
        const foreign = await createTask(stranger, { title: "Чужая" }, atSecond(0));
        await addSession(stranger, foreign.id, interval("10:00", "10:30"), EVENING);
        return foreign.id;
      },
    ],
  ])("3. taskId %s даёт 200 и пустой список", async (_, taskIdFor) => {
    const session = await owner();
    await sessionInNewTask(session, "Anki", interval("10:00", "10:30"));
    const taskId = await taskIdFor();

    expect(await listSessions(session, { ...PERIOD, taskId }, EVENING)).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
  });

  it("3. сессии других пользователей не возвращаются", async () => {
    const stranger = await owner(2);
    await sessionInNewTask(stranger, "Чужая", interval("10:00", "10:30"));
    const session = await owner();
    const own = await sessionInNewTask(session, "Своя", interval("10:15", "10:45"));

    expect(await listSessions(session, PERIOD, EVENING)).toMatchObject({
      status: 200,
      body: { sessions: ids([own]) },
    });
  });
});

describe("GET /api/sessions: ошибки", () => {
  it.each([
    ["без from", { to: PERIOD.to }, "from"],
    ["с from=abc", { from: "abc", to: PERIOD.to }, "from"],
    ["без to", { from: PERIOD.from }, "to"],
    ["с to=abc", { from: PERIOD.from, to: "abc" }, "to"],
    ["с to, равным from", { from: PERIOD.from, to: PERIOD.from }, "to"],
    ["с to раньше from", { from: PERIOD.to, to: PERIOD.from }, "to"],
    ["с периодом на секунду длиннее 31 суток", periodFrom(DAY_START, MAX_PERIOD_SEC + 1), "to"],
  ])("4. запрос %s даёт 400 с полем %s", async (_, query, field) => {
    const session = await owner();

    expectValidationError(await listSessions(session, query, EVENING), [field]);
  });

  it("4. период ровно 31 сутки даёт 200", async () => {
    const session = await owner();

    expect(
      await listSessions(session, periodFrom(DAY_START, MAX_PERIOD_SEC), EVENING),
    ).toMatchObject({ status: 200, body: { sessions: [] } });
  });

  it("4. без сессии ответ 401 unauthorized", async () => {
    expectApiError(
      await api.get(`/api/sessions?from=${PERIOD.from}&to=${PERIOD.to}`),
      "unauthorized",
    );
  });
});
