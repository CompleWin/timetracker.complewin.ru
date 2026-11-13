# Разработка и доработки

Здесь всё, что нужно, чтобы запустить трекер у себя, поменять код и предложить изменение в этот репозиторий. Правила кода, API, текстов и тестов собраны в [AGENTS.md](AGENTS.md): он написан для ИИ-агентов, но так же будет полезен для онбординга. Как развернуть свой экземпляр, описано в [docs/self-hosting.md](docs/self-hosting.md).

## Требования

- Node.js 22.12 или новее, npm 10.
- Для e2e-тестов один раз нужен браузер: `npx playwright install chromium`.

## Команды

Запускаются из корня репозитория.

| Команда                                                       | Что делает                                                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`                                                 | ставит зависимости всех пакетов                                                                                                  |
| `npm run dev`                                                 | Vite на http://localhost:5173 и Worker с `ENV=dev` на http://localhost:8787                                                      |
| `npm run build`                                               | сборка фронтенда и Worker'а                                                                                                      |
| `npm run typecheck`                                           | проверка типов во всех пакетах                                                                                                   |
| `npm run lint`                                                | ESLint и Prettier                                                                                                                |
| `npm run format`                                              | автоисправление ESLint и Prettier                                                                                                |
| `npm test`                                                    | Vitest-тесты `shared` и `api`                                                                                                    |
| `npm run test:e2e`                                            | Playwright-тесты UI, приложение поднимается само на http://localhost:8788                                                        |
| `npm run db:migrate:staging`, `npm run db:migrate:production` | применяют миграции к базе окружения в Cloudflare                                                                                 |
| `npm run deploy:staging`, `npm run deploy:production`         | сборка и деплой окружения, подробнее в [docs/self-hosting.md](docs/self-hosting.md#выкатка-с-компьютера)                         |
| `npm run db:backup:production`                                | бэкап базы production, подробнее в [docs/self-hosting.md](docs/self-hosting.md#бэкап)                                            |
| `npm run bot:setup -- --env staging\|production`              | регистрирует webhook, команды и описания бота, подробнее в [docs/self-hosting.md](docs/self-hosting.md#8-webhook-и-команды-бота) |

В `npm run dev` открывай http://localhost:5173: Vite проксирует `/api`, `/auth`, `/notion`, `/tg` и `/__test` в Worker. Перед стартом собирается фронтенд и применяются миграции к локальной базе D1 в `apps/api/.wrangler`.

## Вход локально

- На `/login` в `dev` есть кнопка "Войти как тестовый пользователь". Она входит без Telegram.
- Для входа через настоящий Telegram Worker'у нужны `TG_CLIENT_ID` и `TG_CLIENT_SECRET` в `apps/api/.dev.vars`, а адрес `http://localhost:5173/auth/telegram/callback` должен быть в Redirect URIs бота. Файл `.dev.vars` не попадает в git.
- Для подключения Notion в `apps/api/.dev.vars` нужны `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` и `TOKEN_ENC_KEY`, а адрес `http://localhost:5173/notion/oauth/callback` должен быть в Redirect URIs подключения. Без них страница настроек открывается, но "Подключить Notion" не сработает.
- Бот локально не работает: Telegram не достучится до localhost.

## База данных

- Схема Drizzle: `apps/api/src/db/schema.ts`.
- Новая миграция по схеме: `npm run db:generate -w @stt/api`. Миграции лежат в `apps/api/migrations`.
- Применить миграции к локальной базе: `npm run db:migrate:local -w @stt/api`.

## Тесты

- API: `apps/api/test/**/*.test.ts`. Тесты идут внутри рантайма Workers (`@cloudflare/vitest-pool-workers`). Перед каждым тестом база очищается и миграции применяются заново. Обвязка лежит в `apps/api/test/harness`. Внешние запросы к Telegram и Notion обвязка перехватывает.
- Чистые функции: `packages/shared/test/**/*.test.ts`.
- UI: `apps/web/e2e/**/*.spec.ts`. Playwright собирает фронтенд, применяет миграции к отдельной локальной базе `apps/api/.wrangler/e2e` и запускает `wrangler dev`.

## Как предложить доработку

1. Открой issue и опиши идею или баг. Так до работы видно, нужна ли доработка и как её лучше сделать.
2. Сделай форк и ветку от `main`.
3. Пиши код по правилам из [AGENTS.md](AGENTS.md).
4. Новая функция приходит с тестами: API в `apps/api/test`, UI в `apps/web/e2e`, чистые функции в `packages/shared/test`.
5. Перед PR должны проходить `npm run typecheck`, `npm run lint`, `npm test` и `npm run test:e2e`. CI проверяет их же на каждом PR.
6. Открой PR в `main` этого репозитория и сошлись в нём на issue.
