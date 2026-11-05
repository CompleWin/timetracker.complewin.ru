import { beforeEach, describe, expect, it } from "vitest";
import { api, testEnv } from "./harness/index.ts";
import { currentUser } from "./harness/session.ts";
import {
  WEBHOOK_PATH,
  WEBHOOK_SECRET_HEADER,
  chatMemberUpdate,
  fakeBot,
  loginWithBotAccess,
  loginWithoutBotAccess,
  sendText,
  sendUpdate,
  telegramApiCalls,
  textUpdate,
  type FakeBot,
} from "./harness/telegram-bot.ts";

const IVAN = 2002;

let bot: FakeBot;

beforeEach(() => {
  bot = fakeBot();
});

describe("POST /tg/webhook: секрет", () => {
  it.each([
    ["без заголовка", {}],
    ["с неверным секретом", { [WEBHOOK_SECRET_HEADER]: "wrong-secret" }],
  ])("1. %s отвечает 401 без исходящих вызовов", async (_case, headers) => {
    const { sender } = await loginWithoutBotAccess(IVAN);

    const response = await api.post(WEBHOOK_PATH, textUpdate(sender, "/status"), { headers });

    expect(response.status).toBe(401);
    expect(telegramApiCalls()).toEqual([]);
  });
});

describe("POST /tg/webhook: чаты и ошибки", () => {
  it("8. сообщение из группы игнорируется: 200 без исходящих вызовов", async () => {
    const { sender } = await loginWithoutBotAccess(IVAN);

    const response = await sendUpdate(textUpdate(sender, "/status", "group"));

    expect(response.status).toBe(200);
    expect(telegramApiCalls()).toEqual([]);
  });

  it("10. ответ 403 на sendMessage даёт botCanMessage = false, webhook отвечает 200", async () => {
    const { session, sender } = await loginWithBotAccess();
    bot.failWith("sendMessage", 403);

    const response = await sendText(sender, "/status");

    expect(response.status).toBe(200);
    expect(bot.sentMessages()).toHaveLength(1);
    expect(await currentUser(session)).toMatchObject({ botCanMessage: false });
  });

  it("11. Telegram отвечает 500 на sendMessage, webhook всё равно отвечает 200", async () => {
    const { sender } = await loginWithBotAccess();
    bot.failWith("sendMessage", 500);

    const response = await sendText(sender, "/status");

    expect(response.status).toBe(200);
    expect(bot.sentMessages()).toHaveLength(1);
  });

  it("11. непонятное обновление получает 200", async () => {
    const response = await sendUpdate({ update_id: 1 });

    expect(response.status).toBe(200);
  });
});

describe("POST /tg/webhook: my_chat_member", () => {
  it("9. новый статус kicked даёт botCanMessage = false", async () => {
    const { session, sender } = await loginWithBotAccess();

    const response = await sendUpdate(chatMemberUpdate(sender, "kicked"));

    expect(response.status).toBe(200);
    expect(await currentUser(session)).toMatchObject({ botCanMessage: false });
  });

  it("9. новый статус member даёт botCanMessage = true", async () => {
    const { session, sender } = await loginWithoutBotAccess(IVAN);

    const response = await sendUpdate(chatMemberUpdate(sender, "member"));

    expect(response.status).toBe(200);
    expect(await currentUser(session)).toMatchObject({ botCanMessage: true });
  });
});

describe("GET /api/health", () => {
  it("12. содержит botUsername", async () => {
    expect(await api.get("/api/health")).toMatchObject({
      status: 200,
      body: { botUsername: testEnv.TG_BOT_USERNAME },
    });
  });
});
