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
  }),
);

export type UpdateMeBody = z.infer<typeof updateMeBody>;
