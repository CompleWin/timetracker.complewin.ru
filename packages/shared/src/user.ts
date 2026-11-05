import { z } from "zod";
import { locales } from "./i18n/locale.ts";
import { atLeastOneField } from "./patch.ts";

export const userSchema = z.object({
  id: z.string(),
  telegramId: z.number(),
  name: z.string(),
  username: z.string().nullable(),
  photoUrl: z.string().nullable(),
  timezone: z.string().nullable(),
  locale: z.enum(locales),
  botCanMessage: z.boolean(),
  reminderThresholdMin: z.int(),
});

export type User = z.infer<typeof userSchema>;

export const userResponse = z.object({ user: userSchema });

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const timeZone = z.string().refine(isTimeZone, "Unknown IANA time zone");

const telegramId = z.int().positive();

export const REMINDER_THRESHOLD_DEFAULT_MIN = 180;
export const REMINDER_THRESHOLD_LOWEST_MIN = 15;
export const REMINDER_THRESHOLD_HIGHEST_MIN = 1440;
export const REMINDER_THRESHOLD_OPTIONS_MIN = [0, 60, 120, 180, 240, 360, 480] as const;

function isReminderThreshold(minutes: number): boolean {
  return (
    minutes === 0 ||
    (minutes >= REMINDER_THRESHOLD_LOWEST_MIN && minutes <= REMINDER_THRESHOLD_HIGHEST_MIN)
  );
}

const reminderThresholdMin = z
  .int()
  .refine(isReminderThreshold, "Must be 0 or between 15 and 1440 minutes");

export const devLoginBody = z.object({
  telegramId: telegramId.optional(),
  name: z.string().trim().min(1).optional(),
  username: z.string().trim().min(1).nullable().optional(),
  locale: z.enum(locales).optional(),
});

export type DevLoginBody = z.infer<typeof devLoginBody>;

export const updateMeBody = atLeastOneField(
  z.object({
    timezone: timeZone.optional(),
    locale: z.enum(locales).optional(),
    reminderThresholdMin: reminderThresholdMin.optional(),
  }),
);

export type UpdateMeBody = z.infer<typeof updateMeBody>;
