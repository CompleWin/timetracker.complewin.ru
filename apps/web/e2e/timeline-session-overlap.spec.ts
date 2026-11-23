import { expect, test, type Page } from "@playwright/test";
import { addLocalSession, localInput, loginInZone } from "./helpers/afternoon.ts";
import { createProject, createTask } from "./helpers/api.ts";
import { PHONE_VIEWPORT } from "./helpers/layout.ts";
import { boxOf, expectPx, widthOf } from "./helpers/picker-size.ts";
import { sessionBlock, timeScale, zoneAtHour } from "./helpers/timeline.ts";
import { button, dialog, field, island, textOf } from "./helpers/ui.ts";

type Session = { title: string; start: string; end: string; projectId?: string };
type Box = Awaited<ReturnType<typeof boxOf>>;

const ZONE = zoneAtHour(18);
const HOUR_PX = 64;
const SUBPIXEL_PX = 0.5;
const ANKI = { title: "Anki", start: "16:23", end: "16:32" };
const MATH = { title: "Думай как математик", start: "16:32", end: "16:47" };

test.use({ timezoneId: ZONE.timezoneId });
test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

async function addSessions(page: Page, ...sessions: Session[]): Promise<void> {
  for (const { title, start, end, projectId } of sessions) {
    const task = await createTask(page, { title, projectId });
    await addLocalSession(page, ZONE, task.id, { start, end });
  }
}

function card(page: Page, { title, start, end }: Session) {
  return sessionBlock(page, title, `${start}\u2013${end}`);
}

function overlap(a: Box, b: Box) {
  return {
    x: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    y: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  };
}

async function expectSideBySide(page: Page, first: Session, second: Session): Promise<void> {
  const firstCard = card(page, first);
  const secondCard = card(page, second);
  await firstCard.scrollIntoViewIfNeeded();
  await secondCard.scrollIntoViewIfNeeded();
  await expect(firstCard).toBeInViewport();
  await expect(secondCard).toBeInViewport();
  const [a, b] = await Promise.all([boxOf(firstCard), boxOf(secondCard)]);
  const intersection = overlap(a, b);
  expect(intersection.y).toBeGreaterThan(SUBPIXEL_PX);
  expect(intersection.x).toBeLessThanOrEqual(SUBPIXEL_PX);
}

async function expectOpensSession(page: Page, session: Session): Promise<void> {
  const target = card(page, session);
  await target.scrollIntoViewIfNeeded();
  const { x, y, width, height } = await boxOf(target);
  await page.mouse.click(x + width / 2, y + height / 2);

  const form = dialog(page, "Сессия");
  await expect(textOf(form, session.title)).toBeVisible();
  await expect(field(form, "Начало")).toHaveValue(localInput(ZONE, session.start));
  await expect(field(form, "Конец")).toHaveValue(localInput(ZONE, session.end));
  await button(form, "Закрыть").click();
  await expect(form).toBeHidden();
}

for (const viewport of [{ width: 1280, height: 720 }, PHONE_VIEWPORT]) {
  test(`1. соседние короткие сессии видны и открываются по центру на ширине ${viewport.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await addSessions(page, ANKI, MATH);
    await page.goto("/");

    await expectSideBySide(page, ANKI, MATH);
    await expectOpensSession(page, ANKI);
    await expectOpensSession(page, MATH);
  });
}

test("2. три короткие карточки попарно не перекрываются, отдельная карточка сохраняет ширину", async ({
  page,
}) => {
  const isolated = { title: "Бег", start: "14:00", end: "14:45" };
  await addSessions(page, isolated);
  await page.goto("/");
  const fullWidth = await widthOf(card(page, isolated));

  const group = [
    { title: "Чтение", start: "12:00", end: "12:05" },
    { title: "Письмо", start: "12:05", end: "12:10" },
    { title: "Заметки", start: "12:10", end: "12:15" },
  ];
  await addSessions(page, ...group);
  await page.reload();

  const boxes = await Promise.all(group.map((session) => boxOf(card(page, session))));
  for (const [index, first] of boxes.entries()) {
    for (const second of boxes.slice(index + 1)) {
      const { x, y } = overlap(first, second);
      expect(Math.min(x, y)).toBeLessThanOrEqual(SUBPIXEL_PX);
    }
  }
  await expectPx(() => widthOf(card(page, isolated)), fullWidth);
});

test("3. начало карточек соответствует времени, масштаб 64 px в час и минимальная высота сохранены", async ({
  page,
}) => {
  const reference = { title: "Чтение", start: "15:00", end: "16:00" };
  await addSessions(page, reference, ANKI);
  await page.goto("/");
  const anki = card(page, ANKI);
  const { height } = await boxOf(anki);
  expect(height).toBeGreaterThan((9 * HOUR_PX) / 60);

  await addSessions(page, MATH);
  await page.reload();

  const mark16 = textOf(timeScale(page), "16:00");
  const mark17 = textOf(timeScale(page), "17:00");
  await expectPx(async () => (await boxOf(mark17)).y - (await boxOf(mark16)).y, HOUR_PX);
  const anchor = card(page, reference);
  await expectPx(async () => (await boxOf(anki)).y - (await boxOf(anchor)).y, (83 * HOUR_PX) / 60);
  await expectPx(
    async () => (await boxOf(card(page, MATH))).y - (await boxOf(anchor)).y,
    (92 * HOUR_PX) / 60,
  );
  await expectPx(async () => (await boxOf(anki)).height, height);
});

test("3. сводка соседних коротких сессий показывает 24 минуты без параллельного времени", async ({
  page,
}) => {
  const languages = await createProject(page, { name: "Языки" });
  await addSessions(page, { ...ANKI, projectId: languages.id }, MATH);
  await page.goto("/");

  const summary = island(page, "Сводка за сегодня");
  await expect(textOf(summary, "24 мин")).toBeVisible();
  await expect(textOf(summary, "2 сессии")).toBeVisible();
});

test("4. реально пересекающиеся сессии видны рядом и открываются по отдельности", async ({
  page,
}) => {
  const first = { title: "Anki", start: "10:00", end: "11:00" };
  const second = { title: "Бег", start: "10:15", end: "10:45" };
  await addSessions(page, first, second);
  await page.goto("/");

  await expectSideBySide(page, first, second);
  await expectOpensSession(page, first);
  await expectOpensSession(page, second);
});
