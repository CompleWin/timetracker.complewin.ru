# Self hosting

Инструкция для тех, кто раньше не работал с Cloudflare. В конце у тебя будет свой трекер на адресе вида `https://stt-production.<поддомен>.workers.dev` со своим ботом и своим подключением Notion. Свой домен можно добавить позже.

Ниже `<APP_URL>` означает адрес твоего экземпляра без `/` в конце.

## Что понадобится

- Аккаунт GitHub.
- Бесплатный аккаунт Cloudflare. Бесплатного тарифа хватает.
- Node.js 22.12 или новее и npm 10.
- Аккаунт Telegram, чтобы создать бота.
- Аккаунт Notion, если нужен синк с Notion. Без него трекер тоже работает.
- Свой домен не обязателен.

## 1. Форк

1. Нажми Fork на странице этого репозитория.
2. В форке открой вкладку Actions и включи workflow'ы кнопкой "I understand my workflows, go ahead and enable them". В форках GitHub выключает их по умолчанию.
3. Склонируй форк к себе и поставь зависимости:

   ```bash
   git clone https://github.com/<твой логин>/<имя форка>.git
   cd <имя форка>
   npm install
   ```

Команды `npx wrangler` ниже запускаются из папки `apps/api`, команды `npm run` из корня репозитория.

## 2. Cloudflare

1. Войди в `wrangler`, это консольная утилита Cloudflare. Команда откроет браузер:

   ```bash
   npx wrangler login
   ```

2. Создай базу production:

   ```bash
   npx wrangler d1 create stt-production
   ```

   Если нужен staging, создай и его базу: `npx wrangler d1 create stt-staging`. В конфиг базу добавлять не нужно: `wrangler` находит её по имени. Если `wrangler` предложит обновить конфиг, ответь "нет". Флаг `--location` выбирает регион базы, например `--location eeur` для Восточной Европы. Без него Cloudflare выберет регион сам.

3. Узнай поддомен `workers.dev` своего аккаунта. В панели Cloudflare открой Workers & Pages, поддомен указан в строке "Your subdomain", там же кнопка Change, чтобы его сменить. Адрес Worker'а составляется из имени Worker'а и этого поддомена:

   - production: `https://stt-production.<поддомен>.workers.dev`;
   - staging: `https://stt-staging.<поддомен>.workers.dev`.

   Это и есть `<APP_URL>`, пока у тебя нет своего домена.

4. Создай API-токен для GitHub Actions. В панели Cloudflare открой My Profile, затем API Tokens, нажми Create Token и выбери шаблон "Edit Cloudflare Workers". Добавь к нему право Account, D1, Edit. В Account Resources выбери свой аккаунт, в Zone Resources все зоны. Доступ к зонам понадобится, когда подключишь свой домен. Сохрани токен: Cloudflare покажет его один раз.

5. Найди Account ID. Он на странице Workers & Pages в блоке Account Details, рядом кнопка копирования.

## 3. Telegram

1. В [@BotFather](https://t.me/BotFather) создай бота командой `/newbot`. BotFather выдаст токен бота, это `TG_BOT_TOKEN`. Имя бота без `@` это `TG_BOT_USERNAME`.
2. В @BotFather открой у бота настройки входа через Telegram. Там лежат Client ID и Client Secret, это `TG_CLIENT_ID` и `TG_CLIENT_SECRET`.
3. Там же в Redirect URIs добавь `<APP_URL>/auth/telegram/callback`. Trusted Origins и Native Login не нужны: код на токен обменивает Worker, а не браузер.

Для staging лучше завести отдельного бота: у одного бота один webhook, а он может смотреть только в одно окружение.

## 4. Notion

Этот шаг можно пропустить. Без Notion трекер работает, только кнопка "Подключить Notion" в настройках не сработает.

1. Открой портал разработчика Notion: https://app.notion.com/developers/connections. Нажми "Create new connection".
2. Заполни название и выбери свой workspace как development workspace.
3. В Redirect URI(s) укажи `<APP_URL>/notion/oauth/callback`.
4. В installation scope выбери свой workspace, а не "Any workspace". Такое подключение работает сразу, ревью Notion ему не нужно. Scope после создания поменять нельзя, только создать подключение заново.
5. В capabilities включи чтение, изменение и добавление контента.
6. На вкладке Configuration лежат OAuth client ID и OAuth client secret, это `NOTION_CLIENT_ID` и `NOTION_CLIENT_SECRET`.

Если staging нужен, создай для него отдельное подключение со своим Redirect URI.

## 5. Секреты Worker'а

Секреты хранятся в Cloudflare, в репозиторий они не попадают. Каждый задаётся командой из `apps/api`, значение `wrangler` спросит в ответ:

```bash
npx wrangler secret put <ИМЯ> --env production
```

Worker'а ещё нет, поэтому на первой команде `wrangler` предложит его создать: соглашайся.

| Секрет                                     | Откуда взять                                                  |
| ------------------------------------------ | ------------------------------------------------------------- |
| `TG_CLIENT_ID`, `TG_CLIENT_SECRET`         | настройки входа бота в @BotFather                             |
| `TG_BOT_TOKEN`                             | токен бота из @BotFather                                      |
| `TG_BOT_USERNAME`                          | имя бота без `@`                                              |
| `TG_WEBHOOK_SECRET`                        | случайная строка, команда ниже                                |
| `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` | вкладка Configuration подключения Notion. Без Notion пропусти |
| `TOKEN_ENC_KEY`                            | 32 случайных байта в base64, команда ниже                     |

Сгенерировать `TG_WEBHOOK_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Сгенерировать `TOKEN_ENC_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

❗ `TOKEN_ENC_KEY` нельзя менять после запуска. Им шифруются токены Notion, и после смены ключа сохранённые токены не расшифровать: всем придётся подключать Notion заново.

Запомни `TG_WEBHOOK_SECRET`, он ещё понадобится для `npm run bot:setup`. Список заданных секретов показывает `npx wrangler secret list --env production`.

Для staging задай те же секреты с `--env staging`: со своим ботом, своим подключением Notion и своими `TG_WEBHOOK_SECRET` и `TOKEN_ENC_KEY`.

## 6. Переменные и секреты репозитория

В форке на GitHub открой Settings, затем Secrets and variables, затем Actions.

На вкладке Secrets создай секреты:

| Секрет                  | Значение             |
| ----------------------- | -------------------- |
| `CLOUDFLARE_API_TOKEN`  | API-токен из шага 2  |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID из шага 2 |

На вкладке Variables создай переменные:

| Переменная           | Обязательна | Значение                                                                                                    |
| -------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `PRODUCTION_APP_URL` | да          | адрес production, например `https://stt-production.<поддомен>.workers.dev`                                  |
| `STAGING_APP_URL`    | нет         | адрес staging. Если её нет, staging не выкатывается                                                         |
| `PUBLISHER_NAME`     | да          | твоё имя или название проекта. Его видно на `/privacy` и `/terms`                                           |
| `SUPPORT_EMAIL`      | да          | почта, на которую пользователи пишут, например с просьбой удалить данные. Её видно на `/privacy` и `/terms` |

Адрес пишется как `https://<хост>`, без пути, порта и `/` в конце. Если адрес на `workers.dev`, Worker выкатывается на него. Если адрес на своём домене, Worker выкатывается на этот домен, а адрес `workers.dev` выключается.

## 7. Первая выкатка

1. В форке открой Actions, выбери workflow "Deploy production" и нажми Run workflow на ветке `main`. С другой ветки workflow ничего не выкатывает.
2. Workflow соберёт трекер, применит миграции к базе, выкатит Worker и проверит, что `<APP_URL>/api/health` отвечает.
3. Открой `<APP_URL>/api/health` сам. В ответе должно быть `"env":"production"`, твои имя бота, `PUBLISHER_NAME` и `SUPPORT_EMAIL`.

После этого вход через Telegram уже работает: открой `<APP_URL>` и войди.

## 8. Webhook и команды бота

Бот отвечает на команды, только когда Telegram знает адрес webhook. Его, команды и описания бота регистрирует `npm run bot:setup`. Запусти его после первой выкатки и потом при смене адреса или `TG_WEBHOOK_SECRET`. Нужны адрес экземпляра, токен бота и тот же `TG_WEBHOOK_SECRET`, что в секретах Worker'а.

bash:

```bash
export APP_URL="<APP_URL>"
export TG_BOT_TOKEN="<токен бота>"
export TG_WEBHOOK_SECRET="<тот же секрет, что в Worker'е>"
npm run bot:setup -- --env production
```

PowerShell:

```powershell
$env:APP_URL = "<APP_URL>"
$env:TG_BOT_TOKEN = "<токен бота>"
$env:TG_WEBHOOK_SECRET = "<тот же секрет, что в Worker'е>"
npm run bot:setup -- --env production
```

Скрипт печатает `ok` на каждый вызов Telegram API. Проверить webhook можно по адресу `https://api.telegram.org/bot<токен бота>/getWebhookInfo`: в `url` должно быть `<APP_URL>/tg/webhook`, а `last_error_message` пустым. Для staging то же с адресом staging, его ботом и `--env staging`.

## 9. Свой домен

1. Добавь домен в Cloudflare как зону: Cloudflare покажет два NS-сервера, их нужно прописать у регистратора домена. Подожди, пока зона станет Active.
2. Поменяй `PRODUCTION_APP_URL` на `https://<твой домен>`.
3. В @BotFather добавь Redirect URI `https://<твой домен>/auth/telegram/callback`.
4. В подключении Notion добавь Redirect URI `https://<твой домен>/notion/oauth/callback`.
5. Запусти workflow "Deploy production". Cloudflare привяжет домен к Worker'у при деплое, адрес `workers.dev` выключится.
6. Перезапусти `npm run bot:setup` с новым `APP_URL`.

## Обновление

1. На странице форка нажми Sync fork, чтобы забрать изменения из исходного репозитория.
2. Если задан `STAGING_APP_URL`, staging выкатится сам.
3. Запусти workflow "Deploy production". Миграции базы workflow применяет сам перед деплоем.

Перед выкаткой с новыми миграциями лучше сделать бэкап.

## Бэкап

- `npm run db:backup:production` выгружает базу production в `backups/stt-production-<время>.sql`. Папка `backups/` в `.gitignore`. Нужен `npx wrangler login`.
- Восстановить из файла в пустую базу (из `apps/api`): `npx wrangler d1 execute stt-production --remote --file <путь к файлу>`.

## Откат

- `npx wrangler deployments list --env production` показывает версии Worker'а.
- `npx wrangler rollback --env production` возвращает предыдущую версию, `npx wrangler rollback <version-id> --env production` нужную.
- Откат не трогает базу. Миграции только добавляются вперёд, поэтому старый код работает с новой схемой. Если миграция испортила данные, базу можно вернуть на момент в прошлом через Time Travel: 7 дней назад на бесплатном тарифе, 30 на Workers Paid.

  ```bash
  npx wrangler d1 time-travel restore stt-production --timestamp=<ISO-время до выкатки>
  ```

## Логи

- Workers Logs включены в обоих окружениях: в панели Cloudflare открой Workers & Pages, затем Worker, затем Logs.
- Живой поток логов: `npx wrangler tail --env production`.

## Выкатка с компьютера

Обычно выкатывает GitHub Actions, но можно и вручную. Нужен `npx wrangler login`. Скрипт деплоя берёт `APP_URL`, `PUBLISHER_NAME` и `SUPPORT_EMAIL` из переменных окружения и без любой из них падает до деплоя. Миграции всегда применяются до деплоя:

```bash
export APP_URL="<APP_URL>"
export PUBLISHER_NAME="<имя>"
export SUPPORT_EMAIL="<почта>"
npm run db:migrate:production
npm run deploy:production
```

Для staging то же с `staging`.
