# Компоненты

Рецепты элементов трекера с размерами и классами Tailwind. Классы это утилиты по токенам темы, общие правила лежат в [principles.md](principles.md).

## Где лежат

Компоненты лежат в `apps/web/src/components/ui/`. Новый компонент делается по рецепту из этого файла, когда он впервые нужен шагу.

| Компонент                      | Рецепт                                                 |
| ------------------------------ | ------------------------------------------------------ |
| `AppIsland`                    | Островок                                               |
| `AppSectionLabel`              | Капс-подпись                                           |
| `AppButton`                    | Кнопка                                                 |
| `AppIconButton`                | Кнопка-иконка                                          |
| `AppChip`                      | Чип                                                    |
| `AppField`                     | Поле ввода                                             |
| `AppCheckbox`                  | Флажок                                                 |
| `AppBadge`                     | Бейдж                                                  |
| `AppFormError`                 | Ошибки и сообщения                                     |
| `AppModal`, `AppConfirmDialog` | Диалоги                                                |
| `AppMenu`, `AppTooltip`        | Меню, подсказки, знаки                                 |
| `AppKbd`, `NotionMark`         | Меню, подсказки, знаки                                 |
| `AppBanner`                    | Плашка "Нет соединения"                                |
| `AppEmptyState`, `AppSkeleton` | Пустое состояние и загрузка                            |
| `AppDayBars`                   | Столбики дней                                          |
| `GitHubMark`                   | Иконки                                                 |
| `ProjectMarker`                | раздел "Цвет проекта" в [principles.md](principles.md) |
| `AppPulseDot`                  | раздел "Движение" в [principles.md](principles.md)     |

## Островок

Белая карточка на бумаге, из островков собрана любая страница.

- Островок: `bg-surface-island border border-line rounded-island`. Белый, рамка 1 px, радиус 22 px, без тени.
- Паддинг: обычный `p-[18px] md:p-7` (18 и 28 px), компактный `p-4 md:p-5` (16 и 20 px).
- Пока идут таймеры, островок запуска на главной обведён рамкой 2 px `border-primary`.
- Вложенная панель: `bg-surface-muted border border-line rounded-panel` (18 px).
- Между островками `gap-5` (20 px).

## Капс-подпись

Открывает островок или раздел, подписывает поле. `text-caps uppercase text-fg-faint`, на тёмном фоне `text-white/70`. Над полем отступ 8 px.

## Кнопка

| Роль             | Вариант         | Классы                                                                    | Примеры                                                |
| ---------------- | --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| главное действие | solid primary   | `bg-primary text-white hover:bg-primary-hover`                            | "Создать", "Сохранить", "Подключить Notion"            |
| второе действие  | outline primary | `border-2 border-primary text-primary hover:bg-primary-soft`              | "Добавить сессию", "Вернуть"                           |
| спокойное второе | outline gray    | `border-2 border-line-strong text-fg-muted hover:border-fg hover:text-fg` | "Отмена", "Настроить", "Убрать"                        |
| опасное          | solid red       | `bg-danger text-white hover:bg-danger-hover`                              | подтверждение в `AppConfirmDialog`, "Удалить навсегда" |
| тихое опасное    | ghost           | `text-danger-ink hover:bg-danger-soft`                                    | "Удалить" в диалоге "Сессия", "Отключить"              |
| тихое акцентное  | ghost           | `text-primary font-semibold hover:bg-primary-soft`                        | "Добавить вручную", "Заполнить"                        |
| тихое            | ghost           | `text-fg-muted` или `text-fg-subtle`, hover `bg-surface-page`             | "Остановить все", "Открыть в Notion"                   |

- Главная, вторая и опасная кнопки это пилюли с капсом: `rounded-full font-extrabold uppercase tracking-[0.1em]`, иконка через `gap-2`. Тихие кнопки без капса.
- Размеры (высота, паддинг, кегль): 2xs 26, 12 и 11 px, xs 32, 16 и 11 px, sm 38, 20 и 12 px, md 46, 26 и 13 px, lg 52, 32 и 14 px. По умолчанию md, в строках списков sm.
- Выключенная главная `bg-surface-active text-fg-faint`, остальные `opacity-50`.
- Фокус: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`.
- На мобильном главная кнопка формы и диалога во всю ширину, от 48 px.
- **Стоп**: `AppIconButton` `rounded-full`, обводка 2 px `border-fg`, иконка `square` с заливкой 15 px, hover `bg-fg text-surface-page`.
- **Старт**: `AppIconButton` 52 px, `bg-primary text-white`, иконка `play` с заливкой 17 px со сдвигом `translate-x-0.5`, hover `bg-primary-hover`.

## Кнопка-иконка

Круг без подписи. Имя задают `aria-label` и `title` с тем же текстом, у кнопки подсказки `title` нет.

- Размеры: 26, 32, 36, 38, 46, 48 и 52 px. На мобильном нажимаемая область от 44 px.
- Обычный тон: `text-fg-subtle hover:bg-surface-page hover:text-fg`. С рамкой: `border border-line-strong text-primary hover:bg-primary-soft`. Тона "Старт" и "Стоп" описаны в разделе "Кнопка".
- Нажата: `bg-primary-soft text-primary`. Иконка 17 px.

## Чип

- Выключен: `border border-line text-fg hover:border-primary hover:text-primary`. Включён: `bg-primary border-primary text-white`. Всегда `rounded-full`, состояние в `aria-pressed`.
- Размеры: md `px-3.5 py-2 text-small`, sm `px-3 py-1.5 text-meta`.

## Пилюля-метрика

Итог времени на странице задачи: `inline-flex h-[30px] items-center rounded-full bg-primary-soft px-3.5 text-small text-primary-ink`.

## Поле ввода

- Подпись: капс-подпись над полем с отступом 8 px. Подсказка под полем `text-meta text-fg-subtle`.
- Поле формы: `rounded-field`, рамка `border-line-strong`, 46 px, кегль `text-input` (16 px). Фокус рамкой `border-primary`, без кольца. Плейсхолдер `text-fg-faint`.
- Иконка в поле `text-fg-faint`, паддинг поля с её стороны 44 px.
- Поиск: пилюля с `search` слева. В панели выбора задачи 48 px с рамкой 2 px `border-primary`.
- `select` и `datetime-local` как поле формы, у `datetime-local` `font-code`. `textarea` от трёх строк, растёт по высоте.
- Поле в строке, например заметка идущего таймера: без рамки и фона, нижняя граница 1 px `border-primary`, кегль не меньше 16 px.
- Ошибка поля: `border-danger bg-danger-soft`, текст под полем `text-meta text-danger-ink`. Заливается поле, а не островок.
- Группа радиокнопок или флажков: `fieldset`, `legend` капс-подписью, подсказка справа от неё. Радиокнопки это чипы sm через `gap-2` с переносом, выбранный чип `bg-primary border-primary text-white`. Фокус на скрытом `input` показывается кольцом на чипе через `has-[:focus-visible]:`. Флажки колонкой через `gap-2`.
- "Русский" и "English" выглядят как чипы, но это кнопки с `aria-pressed`.

## Флажок

Квадрат 18 px, радиус 6 px. Выключен `border-line-strong`, включён `bg-primary border-primary` с белой галкой `check` (штрих 3), выбран частично с белым `minus`. Подпись `text-body` через 10 px.

## Бейдж

`inline-flex h-[26px] items-center rounded-full px-3 text-badge uppercase`, без точки-маркера.

| Тон    | Классы                             | Пример                                         |
| ------ | ---------------------------------- | ---------------------------------------------- |
| accent | `bg-primary-soft text-primary-ink` | пока не используется                           |
| muted  | `bg-surface-active text-fg-subtle` | "Уже в трекере" в диалоге "Добавить из Notion" |

Один признак показывает один индикатор: бейдж не дублируется иконкой рядом.

## Ошибки и сообщения

| Что                     | Где                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ошибка поля             | под полем, рамка поля красная                                                                                             |
| ошибка формы или списка | плашка над кнопками или списком: `rounded-field border border-danger bg-danger-soft px-4 py-3 text-small text-danger-ink` |
| успех                   | такая же плашка `border-success bg-success-soft text-success-hover`                                                       |

Плашку над списком, которую не уберёт исправление формы, закрывает `AppIconButton` 32 px `x` "Скрыть". Тостов нет, сообщения сами не исчезают.

## Диалоги

- `AppModal` это нативный `<dialog>` с `showModal()`, затемнение цветом `--color-overlay`.
- Ширина 460 px, у диалогов базы Notion и "Добавить из Notion" 520 px (`wide`), не шире `100vw − 32px`. Диалог это островок с паддингом островка и `shadow-modal`.
- Заголовок `h2` стилем `text-h3`, связан через `aria-labelledby`. Крестик: `AppIconButton` 32 px справа сверху.
- Закрывают Esc и крестик, клик по затемнению не закрывает.
- При открытии фокус в первом поле, у подтверждения на "Отмена". После закрытия фокус возвращается на кнопку, которая открыла диалог, а если она уже скрыта, на триггер её панели или меню. Диалог из панели выбора или меню сначала закрывает их.
- Кнопки внизу справа через `gap-3`, главная последней. Тихая опасная "Удалить" внизу слева. На мобильном колонкой, главная сверху.
- `AppConfirmDialog`: заголовок это вопрос, текст `text-body text-fg-muted`, кнопки действие (solid red) и "Отмена" (outline gray).
- Дорогое необратимое действие подтверждает `AppConfirmDialog` или ввод слова. Удержания кнопки нет.

## Меню, подсказки, знаки

- **Меню действий**: `min-w-44 py-2 bg-surface-island border border-line rounded-panel shadow-popover` под триггером справа. Пункт `min-h-[44px] rounded-field px-3 gap-3 hover:bg-surface-page hover:text-primary`. Закрывается выбором, Esc и кликом мимо, фокус возвращается на триггер.
- **Подсказка** поясняет настройку, смысл которой не виден из подписи, и есть только там, где её задаёт спецификация. Кнопка: `AppIconButton` 26 px (на мобильном область 44 px), `circle-help` 15 px справа от подписи, без `title`. Подсказка: `max-w-64 rounded-field bg-surface-inverse px-3 py-2 text-meta text-fg-inverse shadow-popover`, роль `tooltip`, связь через `aria-describedby`. Стоит под строкой подписи. Открывается сразу по наведению, фокусу и нажатию, закрывается уходом курсора или фокуса, нажатием мимо и Esc. Esc закрывает только подсказку, диалог остаётся. Без анимации.
- **`NotionMark`**: логотип Notion `fill-current text-fg-subtle`, 15 px, в заголовке задачи 20 px, `flex-none` справа от названия через `gap-1.5`. `role="img"`, `aria-label` и `title` из спецификации. Внутри кнопки с `aria-label` не меняет её имя.
- **`AppKbd`**: `inline-flex items-center rounded-[6px] border border-line-strong bg-surface-island px-1.5 font-code text-meta text-fg-subtle`, `aria-hidden="true"`.

## Плашка "Нет соединения"

Пока нет сети, под шапкой стоит тёмная плашка `AppBanner`: `bg-surface-inverse px-4 py-3 text-small text-fg-inverse md:px-8`, иконка `wifi-off` 15 px слева через `gap-2`, роль `status`.

## Пустое состояние и загрузка

- Пустое состояние: фраза `max-w-[26ch] text-lead text-fg` в островке раздела. Действие рядом, если оно есть, одно.
- Первая загрузка списка: `AppSkeleton` в островке. Полосы `h-3.5 rounded-full bg-surface-active` шириной 100, 72 и 84 % через 14 px.

## Иконки

Lucide, `viewBox 0 0 24 24`, штрих 2, скругления `round`. 15 px в тексте, 17 px в кнопках и пунктах меню. Заливка только у `play` и `square` в "Старт" и "Стоп". Стрелки в текстах и словарях не пишутся, вместо них иконка. Исключения из Lucide: `NotionMark` и `GitHubMark`, встроенные SVG в один цвет `fill-current`.

| Действие                                         | Иконка                                        |
| ------------------------------------------------ | --------------------------------------------- |
| поиск                                            | `search`                                      |
| создать, добавить                                | `plus`                                        |
| старт, стоп                                      | `play`, `square`                              |
| меню действий, меню аккаунта                     | `ellipsis`, `chevron-down`                    |
| проект в дереве                                  | `chevron-right`, у раскрытого повёрнут на 90° |
| назад к трекеру                                  | `chevron-left`                                |
| предыдущий и следующий день в хронологии         | `chevron-left`, `chevron-right`               |
| открыть задачу                                   | `arrow-up-right`                              |
| закрепить                                        | `star`                                        |
| разделы "Трекер", "Задачи", "Настройки", "Архив" | `timer`, `list-todo`, `settings`, `archive`   |
| выйти                                            | `log-out`                                     |
| изменить, написать заметку                       | `pencil`, `pen-line`                          |
| в архив, вернуть, удалить                        | `archive`, `archive-restore`, `trash-2`       |
| закрыть, скрыть                                  | `x`                                           |
| открыть в Notion, открыть бота                   | `external-link`                               |
| обновить список                                  | `refresh-cw`                                  |
| подсказка                                        | `circle-help`                                 |
| сохранено, текущий раздел                        | `check`                                       |
| флажок выбран частично                           | `minus`                                       |
| нет соединения                                   | `wifi-off`                                    |
| клавиши в подвале панели                         | `arrow-up`, `arrow-down`                      |
| изменить размер панели                           | `move-diagonal-2`                             |

## Столбики дней

`AppDayBars`: ряд столбиков `rounded-full`, сегодня последний справа. На главной последний столбик это выбранный день (STT-36), он оформлен как сегодня. Сегодня `bg-primary`, день со временем `bg-primary-muted`, пустой `bg-surface-active`. Подпись `text-caps uppercase`, у сегодня `text-fg`, у остальных `text-fg-faint`. `title` "\<formatShortDate>: \<formatDuration>".

## Каркас страницы

- Страница на бумаге `bg-surface-page`. Шапка и подвал на бумаге, не липкие, шириной `max-w-(--content-max)`.
- У вошедшего в шапке только логотип и меню аккаунта. Поиска, счётчиков и колокольчика нет, разделы и "Выйти" живут в меню.
- Логотип: ссылка на `/` с `aria-label` "SimpleTimeTracker", иконка приложения 26 px и слово-марка `simple`, `time`, `tracker` шрифтом `font-code` с пилюлями вместо дефисов (первая `bg-fg`, вторая `bg-primary`). Слово-марка с `aria-hidden="true"` и не переводится.
- Справа у вошедшего триггер меню с аватаром. Аватар: круг 32 px `bg-primary-soft` с первой буквой имени `text-meta font-semibold text-primary-ink`. Меню: имя, строка входа, пункты "Трекер", "Задачи", "Архив", "Настройки" с `check` у текущего, затем "Выйти".
- Меню аккаунта: 268 px, `rounded-panel border border-line bg-surface-island p-2 shadow-popover`. Пункты как в меню действий, "Выйти" отделён линией `border-t border-line`.
- Контент колонкой по центру, `mx-auto px-4 md:px-8`, островки через `gap-5`. Заголовок страницы `h1` стилем `text-h2`. Первая загрузка списка: `AppSkeleton` в островке.
- Подвал на всех страницах: "Конфиденциальность", "Условия" и справа "GitHub", `text-meta text-fg-subtle`.

## Лендинг

На главной для гостя `/` действуют исключения:

1. Первое слово `h1` залито `text-primary`.
2. Кнопки hero при наведении поднимаются на 2 px.
3. Есть движения лендинга: переливание, блик и свечение главной кнопки, пульс в бейдже, анимация демо. Все только при `motion-safe:`. При `prefers-reduced-motion: reduce` кнопка залита `bg-primary` без слоёв, демо стоит на одном кадре.
4. Окно демо и карточка Notion `rounded-[28px]`.
5. Кегли hero и блока Notion заданы через `clamp()`.
6. Под hero точечная сетка `radial-gradient` с маской.
7. Язык в шапке выбирается выпадающим списком, а не чипами.
8. Демо шире `--content-max`, обёртка `max-w-[1200px]`.

Цвета переливания кнопки hero это токены `--color-cta-*` в `main.css`, только для неё.

## Иконка приложения

- Исходник `apps/web/public/icons/icon.svg`, из него сделаны `icon-192.png`, `icon-512.png` и `apple-touch-icon.png`. Если иконка меняется, все четыре файла обновляются вместе.
- Квадрат `primary` со знаком "S": три верхних штриха белые, нижний `primary-faint`. Без градиентов, теней и текста.
- `theme_color` и `<meta name="theme-color">` #125B3A, `background_color` #F3F2F2.
