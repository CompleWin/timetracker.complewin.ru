import {
  elapsedSec,
  formatDateTime,
  formatDuration,
  formatSessionRange,
  formatShortDate,
  t,
  type Locale,
} from "@stt/shared";

const RICH_TEXT_MAX_LENGTH = 2000;

export type Reader = {
  locale: Locale;
  timeZone: string | null;
};

export type LogSession = {
  startedAt: Date;
  endedAt: Date | null;
  note: string;
};

export type FinishedSession = LogSession & { endedAt: Date };

export type LogLine = {
  prefix: string;
  note: string;
};

export type RichText = { type: "text"; text: { content: string } }[];

export function summaryText(reader: Reader, sessions: LogSession[], now: Date): string {
  const running = sessions.some(({ endedAt }) => endedAt === null);
  const params = {
    total: formatDuration(totalSec(sessions, now), reader.locale),
    count: sessions.length,
    updated: formatDateTime(now.toISOString(), reader.timeZone, reader.locale),
  };
  const key = running ? "notion.block.summaryRunning" : "notion.block.summary";
  return t(reader.locale, key, params);
}

export function logTitle(reader: Reader): string {
  return t(reader.locale, "notion.block.log");
}

export function logLine(reader: Reader, session: FinishedSession): LogLine {
  const startedAt = session.startedAt.toISOString();
  const endedAt = session.endedAt.toISOString();
  const params = {
    date: formatShortDate(startedAt, reader.timeZone, reader.locale),
    range: formatSessionRange(startedAt, endedAt, reader.timeZone, reader.locale),
    duration: formatDuration(elapsedSec(startedAt, session.endedAt.getTime()), reader.locale),
  };
  const key = session.note === "" ? "notion.block.line" : "notion.block.lineWithNote";
  return { prefix: t(reader.locale, key, params), note: session.note };
}

export function lineContent(line: LogLine): string {
  return `${line.prefix}${line.note}`;
}

export function lineRichText(line: LogLine): RichText {
  return [line.prefix, ...chunks(line.note)].map(textItem);
}

export function plainRichText(content: string): RichText {
  return [textItem(content)];
}

function totalSec(sessions: LogSession[], now: Date): number {
  return sessions.reduce(
    (sum, { startedAt, endedAt }) =>
      sum + elapsedSec(startedAt.toISOString(), (endedAt ?? now).getTime()),
    0,
  );
}

function chunks(text: string): string[] {
  const characters = Array.from(text);
  const count = Math.ceil(characters.length / RICH_TEXT_MAX_LENGTH);
  return Array.from({ length: count }, (_, index) =>
    characters.slice(index * RICH_TEXT_MAX_LENGTH, (index + 1) * RICH_TEXT_MAX_LENGTH).join(""),
  );
}

function textItem(content: string): RichText[number] {
  return { type: "text", text: { content } };
}
