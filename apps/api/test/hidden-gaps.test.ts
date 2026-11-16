import { describe, expect, it } from "vitest";
import { deleteAccount } from "./harness/account.ts";
import { api, type TestResponse, type TestSession } from "./harness/api.ts";
import { expectApiError, expectValidationError } from "./harness/assertions.ts";
import { clockIso } from "./harness/clock.ts";
import { db } from "./harness/db.ts";
import { MAX_PERIOD_SEC, periodFrom } from "./harness/period-sessions.ts";
import { withQuery } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";

const PATH = "/api/hidden-gaps";
const PERIOD = { from: clockIso("10:00"), to: clockIso("12:00") };
const GAP = gap("10:30", "11:15");

function gap(start: string, end: string) {
  return { startedAt: clockIso(start), endedAt: clockIso(end) };
}

function listHiddenGaps(
  session: TestSession,
  query: Record<string, string> = PERIOD,
): Promise<TestResponse> {
  return api.get(withQuery(PATH, query), { as: session });
}

async function hideGap(session: TestSession, times = GAP): Promise<void> {
  expect(await api.post(PATH, times, { as: session })).toMatchObject({ status: 204, body: null });
}

describe("POST /api/hidden-gaps", () => {
  it("9, 10. повторная отправка тех же границ сохраняет только один пропуск", async () => {
    const { session } = await loginAs();
    await hideGap(session);
    await hideGap(session);

    expect(await listHiddenGaps(session)).toMatchObject({
      status: 200,
      body: { hiddenGaps: [GAP] },
    });
  });

  it("нормализует границы со смещением в UTC", async () => {
    const { session } = await loginAs();
    await hideGap(session, {
      startedAt: "2030-01-01T13:30:00+03:00",
      endedAt: "2030-01-01T14:15:00+03:00",
    });
    await hideGap(session);

    expect(await listHiddenGaps(session)).toMatchObject({
      status: 200,
      body: { hiddenGaps: [GAP] },
    });
  });

  it("сохраняет пропуски с одинаковым началом и разным концом отдельно", async () => {
    const { session } = await loginAs();
    const longer = { ...GAP, endedAt: clockIso("11:20") };
    await hideGap(session);
    await hideGap(session, longer);

    expect(await listHiddenGaps(session)).toMatchObject({
      status: 200,
      body: { hiddenGaps: [GAP, longer] },
    });
  });

  it.each([
    [{ ...GAP, endedAt: GAP.startedAt }, "endedAt"],
    [gap("11:15", "10:30"), "endedAt"],
    [{ ...GAP, startedAt: "unknown" }, "startedAt"],
    [{ ...GAP, endedAt: "unknown" }, "endedAt"],
  ])("11. неправильные границы %j дают 400 с полем %s", async (body, field) => {
    const { session } = await loginAs();

    const response = await api.post(PATH, body, { as: session });

    expectValidationError(response, [field]);
    expect(Object.keys(response.body.error.details.fields)).toEqual([field]);
  });

  it("без сессии ответ 401 unauthorized", async () => {
    expectApiError(await api.post(PATH, GAP), "unauthorized");
  });
});

describe("GET /api/hidden-gaps", () => {
  it("возвращает пропуски по началу от from включительно до to, отсортированные по началу", async () => {
    const { session } = await loginAs();
    const atFrom = gap("10:00", "10:30");
    const endsAfterTo = gap("11:45", "12:30");

    await hideGap(session, endsAfterTo);
    await hideGap(session, GAP);
    await hideGap(session, atFrom);
    await hideGap(session, gap("09:45", "10:05"));
    await hideGap(session, gap("12:00", "12:30"));

    expect(await listHiddenGaps(session)).toMatchObject({
      status: 200,
      body: { hiddenGaps: [atFrom, GAP, endsAfterTo] },
    });
  });

  it("13. пропуск виден только в сессиях того пользователя, который его скрыл", async () => {
    const first = await loginAs({ telegramId: 1 });
    const second = await loginAs({ telegramId: 1 });
    const other = await loginAs({ telegramId: 2 });
    await hideGap(first.session);

    expect(await listHiddenGaps(second.session)).toMatchObject({
      status: 200,
      body: { hiddenGaps: [GAP] },
    });
    expect(await listHiddenGaps(other.session)).toMatchObject({
      status: 200,
      body: { hiddenGaps: [] },
    });
  });

  it.each([
    [{ from: PERIOD.to, to: PERIOD.from }, "to"],
    [{ from: PERIOD.from, to: PERIOD.from }, "to"],
    [periodFrom(PERIOD.from, MAX_PERIOD_SEC + 1), "to"],
    [{ from: "unknown", to: PERIOD.to }, "from"],
    [{ from: PERIOD.from, to: "unknown" }, "to"],
  ])("12. неправильный период %j даёт 400 с полем %s", async (query, field) => {
    const { session } = await loginAs();

    expectValidationError(await listHiddenGaps(session, query), [field]);
  });

  it("принимает период ровно 31 сутки", async () => {
    const { session } = await loginAs();

    expect(await listHiddenGaps(session, periodFrom(PERIOD.from, MAX_PERIOD_SEC))).toMatchObject({
      status: 200,
      body: { hiddenGaps: [] },
    });
  });

  it("без сессии ответ 401 unauthorized", async () => {
    expectApiError(await api.get(withQuery(PATH, PERIOD)), "unauthorized");
  });
});

it("удаление аккаунта удаляет его скрытые пропуски и сохраняет чужие", async () => {
  const { session, user } = await loginAs({ telegramId: 1 });
  const other = await loginAs({ telegramId: 2 });
  await hideGap(session);
  await hideGap(other.session);

  expect(await deleteAccount(session)).toMatchObject({ status: 204 });

  expect(await db.all("SELECT user_id FROM hidden_gaps WHERE user_id = ?", user.id)).toEqual([]);
  expect(await listHiddenGaps(other.session)).toMatchObject({
    status: 200,
    body: { hiddenGaps: [GAP] },
  });
});
