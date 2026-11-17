# Обвязка тестов API

Карта для того, кто пишет тесты API. Здесь сказано, какой хелпер за что отвечает, чтобы не читать всю обвязку подряд. Открывай файл из таблицы, только когда тест его использует.

Раздел "Пример" и столбец "Функции" в таблице "Файлы" пишет `npm run format`, руками их не правят. Если ты добавил файл обвязки, запусти `npm run format` и заполни у новой строки столбец "Описание". `npm run lint` падает, если пример или таблица отстали от кода, у файла нет описания или образца из списка "Образцы" нет.

## Как идёт тест

- Тесты API лежат в `apps/api/test/*.test.ts` и идут в рантайме Workers под Vitest.
- `setup.ts` перед каждым тестом очищает базу, применяет миграции и сбрасывает перехват внешних запросов.
- Внешний запрос без зарегистрированного обработчика роняет тест. После теста `setup.ts` ещё раз проверяет, что необработанных запросов не было.
- Один файл запускается командой `npx vitest run test/<файл>.test.ts` из `apps/api`.

## Пример

Так выглядит обычный тест API: вход, данные через хелперы, время запроса из `clock.ts`, проверка ответа и ошибки. `npm run format` копирует сюда настоящий тест, а typecheck и тестовый прогон в CI проверяют его типы и поведение. Параметры запроса и форма ответа описаны типами в `api.ts` и `rest.ts`.

<!-- test-map:example:start -->

`session-delete.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { atClock, atSecond } from "./harness/clock.ts";
import {
  EVENING,
  addSession,
  deleteSession,
  expectTaskSessionIds,
  interval,
  requestAddSession,
  requestDeleteSession,
} from "./harness/manual-sessions.ts";
import { createProject, getProject } from "./harness/projects.ts";
import { loginAs } from "./harness/session.ts";
import { createTask, getTask } from "./harness/tasks.ts";
import {
  getActiveTimers,
  getTimerSession,
  loginWithTask,
  requestStart,
  startTimer,
} from "./harness/timers.ts";

describe("DELETE /api/sessions/:id", () => {
  it("9. удаление отвечает 204, после чего GET /api/sessions/:id даёт 404", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);

    expect(await requestDeleteSession(session, stopped.id, EVENING)).toMatchObject({
      status: 204,
    });
    expectApiError(await getTimerSession(session, stopped.id, EVENING), "not_found");
  });

  it("9. удалённая сессия не видна в списке сессий и не входит в totalSec задачи и проекта", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const run = await createTask(session, { title: "Бег", projectId: sport.id }, atSecond(0));
    const removed = await addSession(session, run.id, interval("10:00", "10:40"), EVENING);
    const kept = await addSession(session, run.id, interval("11:00", "11:20"), EVENING);

    await deleteSession(session, removed.id, EVENING);

    await expectTaskSessionIds(session, run.id, [kept], EVENING);
    expect(await getTask(session, run.id, EVENING)).toMatchObject({
      status: 200,
      body: { task: { totalSec: 1200 } },
    });
    expect(await getProject(session, sport.id, EVENING)).toMatchObject({
      status: 200,
      body: { project: { totalSec: 1200 } },
    });
  });

  it("9. удаление идущей сессии убирает её из активных и отменяет таймер", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atClock("12:00"));

    expect(await requestDeleteSession(session, running.id, atClock("12:30"))).toMatchObject({
      status: 204,
    });

    expect(await getActiveTimers(session, atClock("12:30"))).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
    expect(await getTask(session, task.id, atClock("12:30"))).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: null, totalSec: 0 } },
    });
    expectApiError(await getTimerSession(session, running.id, atClock("12:30")), "not_found");
    await expectTaskSessionIds(session, task.id, [], atClock("12:30"));
  });

  it("9. после удаления идущей сессии таймер задачи снова запускается", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atClock("12:00"));
    await deleteSession(session, running.id, atClock("12:30"));

    expect(await requestStart(session, task.id, atClock("12:40"))).toMatchObject({
      status: 201,
    });
  });

  it("9. повторное удаление даёт 404 not_found", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);
    await deleteSession(session, stopped.id, EVENING);

    expectApiError(await requestDeleteSession(session, stopped.id, EVENING), "not_found");
  });

  it("9. удалённая сессия не мешает новой сессии в том же интервале", async () => {
    const { session, task } = await loginWithTask();
    const removed = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);
    await deleteSession(session, removed.id, EVENING);

    expect(
      await requestAddSession(session, task.id, interval("10:00", "10:40"), EVENING),
    ).toMatchObject({ status: 201 });
  });
});
```

<!-- test-map:example:end -->

## Правила

- Хелперы предметной области берут сессию первым аргументом, а время запроса последним. У многих две формы: `requestX(...)` возвращает сырой ответ, чтобы проверить статус или ошибку, а `x(...)` сам проверяет успешный статус и возвращает объект.
- Ответы сверяют через `toMatchObject`, ошибки через `expectApiError` и `expectValidationError` из `assertions.ts`.
- Прямое чтение базы через `db.all` нужно, только когда спецификация говорит о хранении.

## Внешние сервисы

`external.on(method, url, handler)` регистрирует ответ, `external.calls(filter)` возвращает записанные запросы. Для Telegram и Notion уже есть фейки, их создают в `beforeEach`:

| Фейк                     | Файл                   | Что умеет                                                                                        |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `fakeTelegram()`         | `telegram.ts`          | вход через Telegram OAuth: `start`, `callback`, `cancel`, `login`                                |
| `fakeBot()`              | `telegram-bot.ts`      | Bot API: отправленные сообщения, ответы на кнопки, сбои методов                                  |
| `fakeNotion()`           | `notion.ts`            | OAuth Notion, гранты, протухшие токены                                                           |
| `fakeNotionSync()`       | `notion-sync.ts`       | OAuth, рабочее пространство и страницы вместе; `connectNotion`, `pageInNotion`, `requestsDuring` |
| `fakeNotionPull()`       | `notion-pull.ts`       | `fakeNotionSync` плюс сбои и подсчёт запросов `query`                                            |
| `fakeNotionTimeBlocks()` | `notion-time-block.ts` | `fakeNotionSync` плюс блоки страницы с журналом сессий                                           |

## Файлы

<!-- test-map:files:start -->

| Файл                   | Описание                                                                            | Функции                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account.ts`           | удаление аккаунта и отзыв токена Notion                                             | `deleteAccount`, `answerNotionRevoke`, `externalCallsDuring`, `tablesMentioningUser`                                                                                                                                                                                                                           |
| `api.ts`               | отправка запроса в Worker: `api`, типы `TestSession`, `Opts`, `TestResponse`        |                                                                                                                                                                                                                                                                                                                |
| `assertions.ts`        | ошибки по контракту, `ISO_TIME`                                                     | `expectApiError`, `expectValidationError`                                                                                                                                                                                                                                                                      |
| `clock.ts`             | время запроса, см. раздел "Время"                                                   | `atSecond`, `atMinute`, `clockIso`, `clockSecondsIso`, `atClock`                                                                                                                                                                                                                                               |
| `cron.ts`              | запуск cron                                                                         | `runCron`                                                                                                                                                                                                                                                                                                      |
| `db.ts`                | прямое чтение базы `db.all` и сброс                                                 | `resetDatabase`                                                                                                                                                                                                                                                                                                |
| `encoding.ts`          | base64url и SHA-256                                                                 | `base64url`, `base64urlJson`, `sha256Base64url`                                                                                                                                                                                                                                                                |
| `external.ts`          | перехват внешних запросов, `external`                                               | `interceptFetch`, `resetExternal`, `assertAllExternalHandled`                                                                                                                                                                                                                                                  |
| `index.ts`             | `api`, `db`, `external`, `runCron` и `testEnv` одним импортом                       | `runCron`                                                                                                                                                                                                                                                                                                      |
| `manual-sessions.ts`   | ручные сессии, `EVENING`, `MAX_NOTE_LENGTH`                                         | `interval`, `requestAddSession`, `addSession`, `requestEditSession`, `editSession`, `requestDeleteSession`, `deleteSession`, `expectOverlap`, `expectTaskSessionIds`, `expectStoredTimes`                                                                                                                      |
| `notion-blocks.ts`     | фейковые блоки страниц                                                              | `fakeNotionBlocks`, `richTextContents`, `textOf`, `lineTexts`                                                                                                                                                                                                                                                  |
| `notion-databases.ts`  | подключённые базы трекера и их поля, `MAX_DATABASES`                                | `trackerFieldName`, `trackerFieldSpecs`, `expectAddedFields`, `callsFromNowOn`, `databasePath`, `databaseBody`, `listAvailableDatabases`, `listAvailableProperties`, `postDatabase`, `addDatabase`, `patchDatabase`, `updateDatabase`, `deleteDatabase`, `connectedDatabases`                                  |
| `notion-import.ts`     | автоимпорт: статусы и моменты запусков                                              | `pageIn`, `pagesIn`, `statusFieldOf`, `statusOption`, `statusIds`, `withStatus`, `withoutStatus`, `activeTasks`, `taskOfPage`, `projectOfPage`, `onlyProjectNamed`, `startCursorOf`, `filterOf`                                                                                                                |
| `notion-pages.ts`      | фейковые страницы Notion, ошибки `notionFailures`                                   | `fakeNotionPages`, `failureResponse`                                                                                                                                                                                                                                                                           |
| `notion-pull.ts`       | загрузка из Notion                                                                  | `fakeNotionPull`, `userWithDatabase`, `queryUrlOf`, `optionsProperty`, `statusProperty`, `selectValue`, `multiSelectValue`, `searchPages`, `requestLink`, `linkPage`, `projectOfTask`, `projectsNamed`, `queryBodyOf`, `filterConditionsOf`, `cursorOf`, `sendsProperty`                                       |
| `notion-sync.ts`       | синхронизация в Notion, `TASKS_DATABASE`, `SETUP_TIME`                              | `fakeNotionSync`, `loginForSync`, `cronAt`, `callsDuring`, `propertyNamed`, `titlePropertyId`, `trackerPropertyId`, `titleValue`, `richTextValue`, `pagePropertiesOf`, `getSyncStatus`, `syncStatus`, `retrySync`, `readTask`                                                                                  |
| `notion-task-pages.ts` | пользователь с задачей, связанной со страницей Notion                               | `linkedTask`, `connectWithLinkedTask`, `userWithLinkedTask`, `userWithTaskPage`, `projectBoundTo`, `projectsBoundTo`                                                                                                                                                                                           |
| `notion-time-block.ts` | журнал сессий на странице Notion                                                    | `fakeNotionTimeBlocks`, `setTimezone`, `moscowUserWithLinkedTask`, `addSessions`, `userWithSessionLog`, `requestBlockPosition`, `setBlockPosition`                                                                                                                                                             |
| `notion-webhooks.ts`   | вебхук Notion: события и подпись                                                    | `fakePageReads`, `webhookUser`, `webhookTaskUser`, `colleagueWithBase`, `botOf`, `databaseParent`, `dataSourceParent`, `compactUpperId`, `pageEvent`, `eventAbout`, `unrelatedEvent`, `notionSignature`, `postToWebhook`, `sendSigned`, `sendEvent`, `isPageRead`, `readsOfPage`, `bearerOf`, `queriesPerCron` |
| `notion-workspace.ts`  | фейковые базы Notion: источники данных, свойства, поиск                             | `fakeNotionWorkspace`, `isDataSourceQuery`, `resourcePattern`, `resourceId`, `readJson`, `isRecord`, `notFound`                                                                                                                                                                                                |
| `notion.ts`            | фейк OAuth Notion и подключение, `notionWorkspace`                                  | `fakeNotion`, `loginWithNotion`, `getNotionConnection`, `checkNotionConnection`, `disconnectNotion`, `expectConnection`, `expectConnected`, `expectConnectError`, `onlyCall`, `jsonBodyOf`, `tokensOf`                                                                                                         |
| `period-sessions.ts`   | сессии за период, `MAX_PERIOD_SEC`                                                  | `listSessions`, `periodFrom`                                                                                                                                                                                                                                                                                   |
| `projects.ts`          | проекты                                                                             | `projectPath`, `createProject`, `updateProject`, `getProject`, `archiveProject`, `createArchivedProject`, `listProjects`, `expectProjectNames`                                                                                                                                                                 |
| `redirect.ts`          | редиректы                                                                           | `redirectTarget`, `expectRedirect`                                                                                                                                                                                                                                                                             |
| `rest.ts`              | `SessionOpts`, `MISSING_ID` и общие мелочи запросов                                 | `requireStatus`, `withQuery`                                                                                                                                                                                                                                                                                   |
| `schema-replay.ts`     | прогон миграций на снимке базы                                                      | `replayAutoImportMigrations`, `replayPagesOnlyMigration`, `replaySessionMergeMigration`, `moveSessionStart`, `clearValuesInRowsOf`                                                                                                                                                                             |
| `session.ts`           | вход и cookie сессии, `UUID`                                                        | `loginAs`, `sessionFrom`, `currentUser`, `sessionSetCookie`, `expectSessionCookie`, `expectNoSessionCookie`                                                                                                                                                                                                    |
| `setup.ts`             | сброс базы и перехвата перед каждым тестом                                          |                                                                                                                                                                                                                                                                                                                |
| `storage.ts`           | поиск строки по таблицам базы                                                       | `tablesContaining`                                                                                                                                                                                                                                                                                             |
| `tasks.ts`             | задачи                                                                              | `taskPath`, `createTask`, `updateTask`, `getTask`, `archiveTask`, `listTasks`, `expectTaskTitles`                                                                                                                                                                                                              |
| `telegram-bot.ts`      | фейк бота и вебхук Telegram                                                         | `fakeBot`, `telegramApiCalls`, `loginWithBotAccess`, `loginWithoutBotAccess`, `sendUpdate`, `sendText`, `pressButton`, `textUpdate`, `chatMemberUpdate`, `messageWithButton`, `only`, `callbackButton`, `textLines`, `buttonsOf`                                                                               |
| `telegram.ts`          | фейк Telegram OAuth                                                                 | `fakeTelegram`, `startPath`, `expectSignInError`, `secondsFromNow`                                                                                                                                                                                                                                             |
| `test-env.ts`          | переменные окружения тестов `testEnv`: адрес приложения, токены, адреса внешних API |                                                                                                                                                                                                                                                                                                                |
| `timers.ts`            | таймеры и сессии задачи, `MAX_RUNNING_TIMERS`                                       | `sessionPath`, `requestStart`, `requestStopTask`, `requestStopSession`, `getTimerSession`, `getActiveTimers`, `getTaskSessions`, `startTimer`, `stopTimer`, `recordSession`, `loginWithTask`                                                                                                                   |

<!-- test-map:files:end -->

## Образцы

Кроме теста из раздела "Пример":

- `notion-page-removed.test.ts`: тест с фейком Notion и cron.
- `bot-webhook.test.ts`: тест вебхука Telegram с фейком бота.
