# Хелперы e2e

Карта для того, кто пишет e2e-тесты. Здесь сказано, какой хелпер за что отвечает, чтобы не читать все хелперы подряд. Открывай файл из таблицы, только когда тест его использует.

Раздел "Пример" и столбец "Функции" в таблице "Файлы" пишет `npm run format`, руками их не правят. Если ты добавил файл в `helpers/`, запусти `npm run format` и заполни у новой строки столбец "Описание". `npm run lint` падает, если пример или таблица отстали от кода, у файла нет описания или образца из списка "Образцы" нет.

## Как идёт тест

- Тесты лежат в `apps/web/e2e/*.spec.ts` и идут в Playwright в Chromium с локалью `ru-RU`.
- `playwright.config.ts` собирает фронтенд и поднимает Worker на порту 8788. Локально уже запущенный сервер переиспользуется вместе со своей сборкой.
- Если сценарию нужен вход, используй loginAs(page), чтобы у теста был свой пользователь. Гостевые сценарии начинай без сессии.
- Элементы ищут по роли и видимому тексту. Правила e2e-контракта описаны в `docs/contract.md`.
- Один файл запускается командой `npx playwright test e2e/<файл>.spec.ts` из `apps/web`. Полный прогон на слабой машине иногда падает из-за нагрузки, упавшие файлы перезапускай отдельно.

## Пример

Так выглядит e2e-тест со временем: пояс, где сейчас день, вход, данные через API, действия и проверки по роли. `npm run format` копирует сюда настоящий тест, а typecheck и тестовый прогон в CI проверяют его типы и поведение.

<!-- test-map:example:start -->

`session-dialog.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { createTask, startTimer } from "./helpers/api.ts";
import { afternoonZone, localTime, loginInZone } from "./helpers/afternoon.ts";
import { button, dialog, field, link, textOf } from "./helpers/ui.ts";

const ZONE = afternoonZone();
const RUNNING_END_HINT = "Пусто, пока сессия идёт. Укажи время, чтобы остановить её в этот момент.";

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

test("42. в «Сессия» идущей сессии «Конец» пуст и под ним подсказка, у «Заметки» placeholder «Что сделано»", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  const running = await startTimer(page, anki.id);
  await page.goto("/");

  await button(page, `Изменить сессию Anki, ${localTime(ZONE, running.startedAt)}–идёт`).click();

  const form = dialog(page, "Сессия");
  await expect(field(form, "Конец")).toHaveValue("");
  await expect(textOf(form, RUNNING_END_HINT)).toBeVisible();
  await expect(field(form, "Заметка")).toHaveAttribute("placeholder", "Что сделано");
});

test("42. в «Сессия», открытом на странице этой задачи, ссылки «К задаче» нет", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await startTimer(page, anki.id);
  await page.goto(`/tasks/${anki.id}`);

  await page.getByRole("button", { name: /^Изменить сессию / }).click();

  const form = dialog(page, "Сессия");
  await expect(field(form, "Начало")).toBeVisible();
  await expect(link(form, "К задаче")).toHaveCount(0);
});
```

<!-- test-map:example:end -->

## Правила

- Данные для теста создают через API из страницы хелперами `api.ts`, а не через интерфейс. Интерфейс трогают только там, где его проверяет критерий.
- e2e идут по настоящим часам, `X-Test-Now` здесь нет. Если тест зависит от даты или времени суток, он выбирает пояс через `afternoonZone`, как в примере, и переводит время хелперами `afternoon.ts`. Для другого часа есть `zoneAtHour` из `timeline.ts`, для московского времени `moscow-time.ts`.

## Файлы

<!-- test-map:files:start -->

| Файл                | Описание                                                    | Функции                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account-menu.ts`   | меню аккаунта                                               | `menuButton`, `openAccountMenu`, `accountMenu`, `goToSection`                                                                                                                                                                                                                                                                                                                                                                                 |
| `afternoon.ts`      | пояс с 13:00 и перевод времени, см. раздел "Правила"        | `afternoonZone`, `loginInZone`, `addLocalSession`, `localIso`, `localInput`, `localTime`, `localDateRu`, `localDateTimeRu`, `shortDateRu`, `weekdayDateRu`, `dayMonthRu`, `weekdayShortRu`                                                                                                                                                                                                                                                    |
| `api.ts`            | данные через API из страницы, см. раздел "Правила"          | `createProject`, `createTask`, `getTask`, `listTasks`, `archiveTask`, `pinTask`, `archiveProject`, `startTimer`, `getSession`, `activeTimers`, `taskSessions`, `addSession`, `setTimeZone`, `currentUser`, `botUsername`, `publisherContacts`, `listProjects`                                                                                                                                                                                 |
| `auth.ts`           | вход через `POST /auth/dev-login`                           | `uniqueTelegramId`, `loginAs`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `clock.ts`          | часы таймера на экране                                      | `clockIn`, `readClockSec`, `expectClockTicks`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `console.ts`        | ошибки консоли                                              | `collectConsoleErrors`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `landing.ts`        | лендинг, `REPO_URL`                                         | `languageButton`, `languageList`, `languageOption`, `chooseLanguage`, `heroBadge`, `demo`, `scrollDemoIntoView`, `timersBlock`, `shownTexts`, `isOnScreen`, `startDemoPlayback`                                                                                                                                                                                                                                                               |
| `layout.ts`         | ширина телефона `PHONE_VIEWPORT` и горизонтальная прокрутка | `expectNoHorizontalScroll`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `moscow-time.ts`    | время в `Europe/Moscow`                                     | `moscowIso`, `moscowDate`, `moscowTime`                                                                                                                                                                                                                                                                                                                                                                                                       |
| `picker-size.ts`    | размер панели выбора                                        | `pickerRegion`, `resizeHandle`, `boxOf`, `isInside`, `leftEdge`, `rightEdge`, `bottomEdge`, `widthOf`, `panelWidth`, `panelHeight`, `panelSize`, `expectPx`, `expectSameEdge`, `expectPanelSize`, `scrollHandleIntoView`, `handleCenter`, `dragHandleTo`, `dragHandleBy`, `rawPickerSize`, `storedPickerSize`, `expectStoredSize`, `storePickerSize`                                                                                          |
| `picker.ts`         | панель выбора задачи                                        | `pickerTrigger`, `taskSearch`, `projectTree`, `foundTasks`, `startTimerButton`, `stopTimerButton`, `alreadyRunningButton`, `openPicker`, `expectPickerClosed`, `searchTasks`, `startFromPicker`, `openCreateDialog`, `submitNewTask`, `createTaskInDialog`, `expectStartRows`, `expectTopToBottom`                                                                                                                                            |
| `service-worker.ts` | service worker                                              | `reloadOnceServiceWorkerIsActive`, `isControlledByServiceWorker`                                                                                                                                                                                                                                                                                                                                                                              |
| `task-page.ts`      | страница задачи                                             | `openTaskPage`, `taskHeader`, `byDayIsland`, `openTaskEditor`, `saveTaskEditor`, `moveTaskToProject`                                                                                                                                                                                                                                                                                                                                          |
| `tasks-page.ts`     | страница "Задачи"                                           | `openTasksPage`, `groupHeading`, `taskSearchField`, `selectAllCheckbox`, `taskCheckbox`, `editTaskButton`, `archiveTaskButton`, `selectedTasks`, `moveTargetField`, `taskRow`, `selectTasks`, `searchOnTasksPage`, `moveSelectedTo`, `openArchiveConfirm`, `sportStudyLanguages`                                                                                                                                                              |
| `timeline.ts`       | хронология                                                  | `zoneAtHour`, `waitPastFullHour`, `timeline`, `timeScale`, `sessionBlock`, `fillGapButton`, `nowLine`, `hourMarks`, `hourMarkTexts`, `firstHourMark`, `lastHourMark`, `spanOf`, `middleOf`, `expectShownInScale`, `expectNowLineShownInScale`, `expectFirstMarkShownInScale`, `expectLastMarkShownInScale`, `scaleScrollTop`, `waitForOpeningScroll`, `scrollScaleToStart`, `nextApiRead`, `returnToTab`, `afterNextFrames`, `dashedFrameTop` |
| `ui.ts`             | локаторы по роли с точным именем                            | `button`, `heading`, `pageTitle`, `link`, `group`, `field`, `island`, `region`, `runningNow`, `pageFooter`, `dialog`, `menuItem`, `textOf`, `expectInSection`, `chooseRadio`, `focusWithKeyboard`                                                                                                                                                                                                                                             |
| `url.ts`            | проверка адреса для `toHaveURL`                             | `urlMatching`                                                                                                                                                                                                                                                                                                                                                                                                                                 |

<!-- test-map:files:end -->

## Образцы

Кроме теста из раздела "Пример":

- `task-page-actions.spec.ts`: обычный тест без зависимости от времени, с данными через API, кликами и проверкой по роли.
