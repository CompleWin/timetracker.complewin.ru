import { beforeEach, describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { atMinute } from "./harness/clock.ts";
import { activeTasks, pageIn, taskOfPage } from "./harness/notion-import.ts";
import { notionFailures, type FakePage, type NotionFailure } from "./harness/notion-pages.ts";
import { fakeNotionPull, type FakeNotionPull } from "./harness/notion-pull.ts";
import { cronAt } from "./harness/notion-sync.ts";
import {
  OK_REPLY,
  SIGNATURE_HEADER,
  eventAbout,
  fakePageReads,
  notionSignature,
  postToWebhook,
  queriesPerCron,
  sendEvent,
  sendSigned,
  unrelatedEvent,
  webhookUser,
  type FakePageReads,
  type NotionWebhookEvent,
  type WebhookUser,
} from "./harness/notion-webhooks.ts";

const PAGE_CREATED_AT = atMinute(1);
const EVENT_TIME = atMinute(2);
const OTHER_SECRET = "other-notion-webhook-secret";
const VERIFICATION_BODY = JSON.stringify({ verification_token: "secret_verification_token" });

type UserWithNewPage = WebhookUser & {
  page: FakePage;
  event: NotionWebhookEvent;
};

let fake: FakeNotionPull;
let reads: FakePageReads;

beforeEach(() => {
  fake = fakeNotionPull();
  reads = fakePageReads(fake.pages);
});

async function userWithNewPage(): Promise<UserWithNewPage> {
  const user = await webhookUser(fake);
  const page = pageIn(fake, user.added, "Anki", {}, PAGE_CREATED_AT);
  const event = eventAbout(page, user.added.dataSource, { type: "page.created" });
  return { ...user, page, event };
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function withoutField(event: NotionWebhookEvent, field: keyof NotionWebhookEvent): string {
  return JSON.stringify({ ...event, [field]: undefined });
}

describe("проверочный запрос", () => {
  it("1. тело с verification_token без подписи: 200 { ok: true }, запросов к Notion нет", async () => {
    await webhookUser(fake);
    const requests = await fake.requestsDuring(async () => {
      expect(await postToWebhook(VERIFICATION_BODY, EVENT_TIME)).toMatchObject(OK_REPLY);
    });

    expect(requests).toEqual([]);
  });

  it("1. тело с verification_token и неверной подписью тоже получает 200 { ok: true }", async () => {
    const headers = { [SIGNATURE_HEADER]: await notionSignature(VERIFICATION_BODY, OTHER_SECRET) };

    expect(await postToWebhook(VERIFICATION_BODY, EVENT_TIME, headers)).toMatchObject(OK_REPLY);
  });

  it("1. проверочный запрос не считается событием: pull по-прежнему идёт раз в 5 минут", async () => {
    await webhookUser(fake);
    await cronAt(atMinute(0));
    await postToWebhook(VERIFICATION_BODY, atMinute(1));

    expect(await queriesPerCron(fake, [5, 10])).toEqual([1, 1]);
  });

  it("1. тело с verification_token и полем type без подписи получает 401 unauthorized", async () => {
    const body = JSON.stringify({
      verification_token: "secret_verification_token",
      type: "page.created",
    });

    expectApiError(await postToWebhook(body, EVENT_TIME), "unauthorized");
  });
});

describe("подпись события", () => {
  const badSignatures: [string, (event: NotionWebhookEvent) => Promise<Record<string, string>>][] =
    [
      ["без заголовка X-Notion-Signature", async () => ({})],
      [
        "с подписью другим секретом",
        async (event) => ({
          [SIGNATURE_HEADER]: await notionSignature(prettyJson(event), OTHER_SECRET),
        }),
      ],
      [
        "с подписью того же события без отступов",
        async (event) => ({ [SIGNATURE_HEADER]: await notionSignature(JSON.stringify(event)) }),
      ],
    ];

  it.each(badSignatures)(
    "3. событие о новой записи %s: 401 unauthorized, задача не создаётся, запросов к Notion нет",
    async (_case, signatureFor) => {
      const { session, event } = await userWithNewPage();
      const headers = await signatureFor(event);
      const requests = await fake.requestsDuring(async () => {
        expectApiError(await postToWebhook(prettyJson(event), EVENT_TIME, headers), "unauthorized");
      });

      expect(requests).toEqual([]);
      expect(await activeTasks(session, EVENT_TIME)).toEqual([]);
    },
  );

  it("3. подпись считается от сырых байтов: тело с отступами, подписанное как есть, принято, задача создана", async () => {
    const { session, page, event } = await userWithNewPage();

    expect(await sendSigned(prettyJson(event), EVENT_TIME)).toMatchObject(OK_REPLY);
    expect(await taskOfPage(session, page, EVENT_TIME)).toMatchObject({ title: "Anki" });
  });

  it("3. тело не JSON без подписи получает 401 unauthorized, а не 400", async () => {
    expectApiError(await postToWebhook("{not json", EVENT_TIME), "unauthorized");
  });
});

describe("неполное событие", () => {
  const event = unrelatedEvent();

  it.each([
    ["тело не JSON", "{not json"],
    ["нет id", withoutField(event, "id")],
    ["нет type", withoutField(event, "type")],
    ["нет workspace_id", withoutField(event, "workspace_id")],
    ["нет entity", withoutField(event, "entity")],
    ["нет entity.id", JSON.stringify({ ...event, entity: { type: "page" } })],
    ["нет entity.type", JSON.stringify({ ...event, entity: { id: event.entity.id } })],
  ])("4. подпись верна, %s: 400 validation_error", async (_case, body) => {
    expectApiError(await sendSigned(body, EVENT_TIME), "validation_error");
  });
});

describe("неподходящее событие", () => {
  it.each([
    ["page.content_updated", "page"],
    ["comment.created", "comment"],
    ["database.schema_updated", "database"],
    ["data_source.schema_updated", "data_source"],
    ["page.created", "database"],
    ["page.properties_updated", "block"],
  ])(
    "5. type %s, entity.type %s: 200 { ok: true }, запросов к Notion нет",
    async (type, entityType) => {
      const { session, event } = await userWithNewPage();
      const foreign = { ...event, type, entity: { ...event.entity, type: entityType } };
      const requests = await fake.requestsDuring(async () => {
        expect(await sendEvent(foreign, EVENT_TIME)).toMatchObject(OK_REPLY);
      });

      expect(requests).toEqual([]);
      expect(await activeTasks(session, EVENT_TIME)).toEqual([]);
    },
  );
});

describe("подходящее событие", () => {
  it("6. событие обработано до ответа: сразу после 200 { ok: true } задача уже есть", async () => {
    const { session, page, event } = await userWithNewPage();

    expect(await sendEvent(event, EVENT_TIME)).toMatchObject(OK_REPLY);
    expect(await taskOfPage(session, page, EVENT_TIME)).toMatchObject({ title: "Anki" });
  });

  it.each<[string, NotionFailure]>([
    ["500", notionFailures.serverError],
    ["429", notionFailures.rateLimited(30)],
    ["401", notionFailures.unauthorized],
  ])(
    "6. Notion ответил %s на GET страницы: ответ всё равно 200 { ok: true }",
    async (_, failure) => {
      const { event } = await userWithNewPage();
      reads.fail(failure);

      expect(await sendEvent(event, EVENT_TIME)).toMatchObject(OK_REPLY);
    },
  );

  it("6. ответ на событие содержит X-Server-Now, равный X-Test-Now", async () => {
    const { event } = await userWithNewPage();
    const response = await sendEvent(event, EVENT_TIME);

    expect(response.headers.get("X-Server-Now")).toBe(EVENT_TIME.now);
  });
});
