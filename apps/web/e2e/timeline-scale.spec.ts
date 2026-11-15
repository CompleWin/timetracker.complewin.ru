import { expect, test } from "@playwright/test";
import { createTask } from "./helpers/api.ts";
import { addLocalSession, loginInZone, type AfternoonZone } from "./helpers/afternoon.ts";
import {
  bottomOf,
  dashedFrameTop,
  expectWithinScale,
  fillGapButton,
  firstHourMark,
  lastHourMark,
  localClockNow,
  sessionBlock,
  timeline,
  zoneAtHour,
} from "./helpers/timeline.ts";
import { textOf } from "./helpers/ui.ts";

const SUBPIXEL_PX = 0.5;

function atLocalHour(hour: number, defineTests: (zone: AfternoonZone) => void): void {
  test.describe(`сейчас ${String(hour).padStart(2, "0")} ч по времени пользователя`, () => {
    const zone = zoneAtHour(hour);
    test.use({ timezoneId: zone.timezoneId });
    test.beforeEach(async ({ page }) => {
      await loginInZone(page, zone);
    });
    defineTests(zone);
  });
}

atLocalHour(11, (zone) => {
  test("1. одна сессия 05:10–05:40: первая отметка шкалы «05:00»", async ({ page }) => {
    const task = await createTask(page, { title: "Чтение" });
    await addLocalSession(page, zone, task.id, { start: "05:10", end: "05:40" });

    await page.goto("/");

    await expect(sessionBlock(page, "Чтение", "05:10–05:40")).toBeVisible();
    await expect.poll(() => firstHourMark(page)).toBe("05:00");
  });
});

atLocalHour(15, (zone) => {
  test("2. одна сессия 14:10–14:40: первая отметка шкалы «14:00», отметки «08:00» нет", async ({
    page,
  }) => {
    const task = await createTask(page, { title: "Чтение" });
    await addLocalSession(page, zone, task.id, { start: "14:10", end: "14:40" });

    await page.goto("/");

    await expect(sessionBlock(page, "Чтение", "14:10–14:40")).toBeVisible();
    await expect.poll(() => firstHourMark(page)).toBe("14:00");
    await expect(textOf(timeline(page), "08:00")).toHaveCount(0);
  });
});

atLocalHour(0, (zone) => {
  test("3. сразу после полуночи без сессий: первая отметка шкалы «00:00», линия «сейчас» с подписью текущего времени видна внутри шкалы", async ({
    page,
  }) => {
    await page.goto("/");

    await expect.poll(() => firstHourMark(page)).toBe("00:00");
    await expect(async () => {
      const nowLabel = textOf(timeline(page), localClockNow(zone)).last();
      await expect(nowLabel).toBeVisible({ timeout: 1_000 });
      await expectWithinScale(page, nowLabel);
    }).toPass();
  });
});

atLocalHour(23, () => {
  test("4. поздно вечером последняя отметка шкалы «00:00», отметки «24:00» нет", async ({
    page,
  }) => {
    await page.goto("/");

    await expect.poll(() => lastHourMark(page)).toBe("00:00");
    await expect(textOf(timeline(page), "24:00")).toHaveCount(0);
  });
});

atLocalHour(13, (zone) => {
  test("5. «Чтение» 08:58–09:03 и «Лаба» 09:30–10:30: блоки обеих сессий видны, пропуска 09:03–09:30 нет", async ({
    page,
  }) => {
    const reading = await createTask(page, { title: "Чтение" });
    const lab = await createTask(page, { title: "Лаба" });
    await addLocalSession(page, zone, reading.id, { start: "08:58", end: "09:03" });
    await addLocalSession(page, zone, lab.id, { start: "09:30", end: "10:30" });

    await page.goto("/");

    await expect(sessionBlock(page, "Чтение", "08:58–09:03")).toBeVisible();
    await expect(sessionBlock(page, "Лаба", "09:30–10:30")).toBeVisible();
    await expect(fillGapButton(page, "09:03–09:30")).toHaveCount(0);
    await expect(textOf(page, "Пропуск 27 мин")).toHaveCount(0);
  });

  test("6. «Чтение» 08:58–09:03 и «Лаба» 10:00–11:00: «Пропуск 57 мин» и «Заполнить пропуск 09:03–10:00» видны, верх пунктирного блока не выше низа блока «Чтение»", async ({
    page,
  }) => {
    const reading = await createTask(page, { title: "Чтение" });
    const lab = await createTask(page, { title: "Лаба" });
    await addLocalSession(page, zone, reading.id, { start: "08:58", end: "09:03" });
    await addLocalSession(page, zone, lab.id, { start: "10:00", end: "11:00" });

    await page.goto("/");

    const fillGap = fillGapButton(page, "09:03–10:00");
    await expect(fillGap).toBeVisible();
    await expect(textOf(timeline(page), "Пропуск 57 мин")).toBeVisible();
    const readingBottom = await bottomOf(sessionBlock(page, "Чтение", "08:58–09:03"));
    expect(await dashedFrameTop(fillGap)).toBeGreaterThanOrEqual(readingBottom - SUBPIXEL_PX);
  });

  test("7. сессии 10:00–10:30 и 11:15–11:45 дают «Пропуск 45 мин» и «Заполнить пропуск 10:30–11:15»", async ({
    page,
  }) => {
    const task = await createTask(page, { title: "Чтение" });
    await addLocalSession(page, zone, task.id, { start: "10:00", end: "10:30" });
    await addLocalSession(page, zone, task.id, { start: "11:15", end: "11:45" });

    await page.goto("/");

    await expect(textOf(timeline(page), "Пропуск 45 мин")).toBeVisible();
    await expect(fillGapButton(page, "10:30–11:15")).toBeVisible();
  });

  test("8. сессии 10:00–10:30 и 10:50–11:20 дают «Пропуск 20 мин» и «Заполнить пропуск 10:30–10:50»", async ({
    page,
  }) => {
    const task = await createTask(page, { title: "Чтение" });
    await addLocalSession(page, zone, task.id, { start: "10:00", end: "10:30" });
    await addLocalSession(page, zone, task.id, { start: "10:50", end: "11:20" });

    await page.goto("/");

    await expect(textOf(timeline(page), "Пропуск 20 мин")).toBeVisible();
    await expect(fillGapButton(page, "10:30–10:50")).toBeVisible();
  });
});
