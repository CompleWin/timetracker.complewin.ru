import { t, type Locale, type MessageKey, type ProjectColor } from "@stt/shared";

export type DemoProject = "work" | "meetings" | "study";

export type DemoTask =
  | "email"
  | "documents"
  | "monthlyReport"
  | "clientPresentation"
  | "quarterlyBudget"
  | "teamCall"
  | "clientCall"
  | "standUp"
  | "englishClass";

export type DemoTimerId = "a" | "b";

export type DemoTarget =
  "home" | "rest" | "trigger" | "found-row" | "note-a" | "chip-b" | "stop-a" | "stop-b";

export type DemoMoment = {
  cycle: number;
  t: number;
  cycleStartMin: number;
  nowMin: number;
  episode: DemoEpisode;
};

export type DemoEpisode = {
  taskA: DemoTask;
  taskB: DemoTask;
  query: MessageKey;
  note: MessageKey;
};

export type DemoSession = {
  id: string;
  task: DemoTask;
  startMin: number;
  endMin: number;
  running: boolean;
  lane: number;
  lanes: number;
};

export type DemoTimer = {
  id: DemoTimerId;
  task: DemoTask;
  startMin: number;
  seconds: number;
  shown: boolean;
  stopPressed: boolean;
};

export type DemoNote = {
  editing: boolean;
  draft: string;
  saved: string;
  hovered: boolean;
};

export type DemoPickerRow = {
  task: DemoTask;
  highlighted: boolean;
  running: boolean;
  pinned: boolean;
  todaySec: number;
  target: DemoTarget | null;
};

export type DemoPicker = {
  open: boolean;
  query: string;
  rows: DemoPickerRow[];
  createText: string | null;
};

export type DemoPin = {
  task: DemoTask;
  pressed: boolean;
  target: DemoTarget | null;
};

export type DemoProjectShare = {
  project: DemoProject;
  seconds: number;
};

export const DEMO_CYCLE_MS = 16_000;
export const DEMO_STILL_MS = 11_000;
export const DEMO_FADE_IN_MS = 400;
export const DEMO_CURSOR_IN_MS = 250;
export const DEMO_CLICK_MS = 550;
export const DEMO_PRESS_MS = 160;

const FIRST_CYCLE_START_MIN = 15 * 60;
const MINUTES_PER_CYCLE = 60;
const SECONDS_PER_MINUTE = 60;
const SEARCH_LIMIT = 4;
const RECENT_LIMIT = 3;
const QUERY_STARTS_MS = 1550;
const QUERY_CHAR_MS = 150;
const NOTE_STARTS_MS = 4800;
const NOTE_CHAR_MS = 70;

export const PROJECT_COLORS: Record<DemoProject, ProjectColor> = {
  work: "blue",
  meetings: "purple",
  study: "yellow",
};

export const PROJECT_NAMES: Record<DemoProject, MessageKey> = {
  work: "demo.project.work",
  meetings: "demo.project.meetings",
  study: "demo.project.study",
};

export const DEMO_PROJECTS: DemoProject[] = ["work", "meetings", "study"];

const TASKS: Record<DemoTask, { name: MessageKey; project: DemoProject }> = {
  email: { name: "demo.task.email", project: "work" },
  documents: { name: "demo.task.documents", project: "work" },
  monthlyReport: { name: "demo.task.monthlyReport", project: "work" },
  clientPresentation: { name: "demo.task.clientPresentation", project: "work" },
  quarterlyBudget: { name: "demo.task.quarterlyBudget", project: "work" },
  teamCall: { name: "demo.task.teamCall", project: "meetings" },
  clientCall: { name: "demo.task.clientCall", project: "meetings" },
  standUp: { name: "demo.task.standUp", project: "meetings" },
  englishClass: { name: "demo.task.englishClass", project: "study" },
};

const SEARCH_ORDER: DemoTask[] = [
  "email",
  "documents",
  "monthlyReport",
  "clientPresentation",
  "quarterlyBudget",
  "teamCall",
  "clientCall",
  "standUp",
  "englishClass",
];

const PINNED_TASKS: DemoTask[] = ["teamCall", "clientCall"];

const EARLIER_SESSIONS: { task: DemoTask; startMin: number; endMin: number }[] = [
  { task: "standUp", startMin: 600, endMin: 630 },
  { task: "documents", startMin: 640, endMin: 730 },
  { task: "englishClass", startMin: 780, endMin: 825 },
  { task: "email", startMin: 860, endMin: 900 },
];

const EPISODES: DemoEpisode[] = [
  {
    taskA: "monthlyReport",
    taskB: "teamCall",
    query: "demo.episode.0.query",
    note: "demo.episode.0.note",
  },
  {
    taskA: "clientPresentation",
    taskB: "clientCall",
    query: "demo.episode.1.query",
    note: "demo.episode.1.note",
  },
  {
    taskA: "quarterlyBudget",
    taskB: "teamCall",
    query: "demo.episode.2.query",
    note: "demo.episode.2.note",
  },
];

const TIMERS: Record<
  DemoTimerId,
  { startMin: number; endMin: number; startsAt: number; stopsAt: number; pressedFrom: number }
> = {
  a: { startMin: 2, endMin: 52, startsAt: 2900, stopsAt: 14100, pressedFrom: 13950 },
  b: { startMin: 18, endMin: 50, startsAt: 8600, stopsAt: 12800, pressedFrom: 12650 },
};

const CLOCK_POINTS: [number, number][] = [
  [0, 0],
  [2900, 2],
  [8600, 18],
  [12000, 48],
  [12800, 50],
  [14100, 52],
  [16000, 60],
];

const FIRST_PICKER: [number, number] = [1100, 2900];
const SECOND_PICKER: [number, number] = [7300, 8600];
const TRIGGER_HOVERS: [number, number][] = [
  [950, 1100],
  [7150, 7300],
];
const NOTE_EDITING: [number, number] = [4600, 6400];
const NOTE_HOVER: [number, number] = [4450, 4600];
const CHIP_PRESS: [number, number] = [8450, 8650];

const WAYPOINTS: [number, DemoTarget][] = [
  [0, "home"],
  [250, "trigger"],
  [2050, "found-row"],
  [3750, "note-a"],
  [6450, "trigger"],
  [7750, "chip-b"],
  [9050, "rest"],
  [11950, "stop-b"],
  [13250, "stop-a"],
  [14550, "home"],
];

export const DEMO_CLICKS = [1100, 2900, 4600, 7300, 8600, 12800, 14100];

export const DEMO_TIME_ZONE = "UTC";

const DEMO_DAY_MS = Date.UTC(2026, 10, 3);
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 24 * 60;
const NOON_MIN = 12 * 60;
const SECONDS_PER_HOUR = 3600;
const PAST_DAY_HOURS = [5.2, 6.1, 3.4, 0, 1.2, 6.8];

export type DemoDay = { iso: string; seconds: number; today: boolean };

export function demoIso(minutes: number): string {
  return new Date(DEMO_DAY_MS + minutes * MS_PER_MINUTE).toISOString();
}

export function demoWeek(todaySec: number): DemoDay[] {
  const past = PAST_DAY_HOURS.map((hours, index) => ({
    iso: demoIso(NOON_MIN - (PAST_DAY_HOURS.length - index) * MINUTES_PER_DAY),
    seconds: hours * SECONDS_PER_HOUR,
    today: false,
  }));
  return [...past, { iso: demoIso(NOON_MIN), seconds: todaySec, today: true }];
}

export function taskName(task: DemoTask, locale: Locale): string {
  return t(locale, TASKS[task].name);
}

export function taskProject(task: DemoTask): DemoProject {
  return TASKS[task].project;
}

export function demoMoment(elapsedMs: number): DemoMoment {
  const cycle = Math.floor(elapsedMs / DEMO_CYCLE_MS);
  const t = elapsedMs - cycle * DEMO_CYCLE_MS;
  const cycleStartMin = FIRST_CYCLE_START_MIN + MINUTES_PER_CYCLE * cycle;
  return {
    cycle,
    t,
    cycleStartMin,
    nowMin: cycleStartMin + minutesIntoCycle(t),
    episode: episodeOf(cycle),
  };
}

export function demoSessions(moment: DemoMoment): DemoSession[] {
  const earlier = EARLIER_SESSIONS.map((session, index) => ({
    ...session,
    id: `earlier-${index}`,
    running: false,
    lane: 0,
    lanes: 1,
  }));
  const fromCycles = Array.from({ length: moment.cycle + 1 }, (_, cycle) =>
    cycleSessions(cycle, moment),
  ).flat();
  return [...earlier, ...fromCycles];
}

export function demoTimers(moment: DemoMoment): DemoTimer[] {
  const { episode } = moment;
  return [timerOf("a", episode.taskA, moment), timerOf("b", episode.taskB, moment)];
}

export function demoNote(moment: DemoMoment, locale: Locale): DemoNote {
  const text = t(locale, moment.episode.note);
  const typed =
    moment.t < NOTE_STARTS_MS ? 0 : Math.floor((moment.t - NOTE_STARTS_MS) / NOTE_CHAR_MS) + 1;
  return {
    editing: within(moment.t, NOTE_EDITING),
    draft: text.slice(0, Math.min(text.length, typed)),
    saved: moment.t >= NOTE_EDITING[1] ? text : "",
    hovered: within(moment.t, NOTE_HOVER),
  };
}

export function triggerHighlighted(moment: DemoMoment): boolean {
  return pickerOpen(moment) || TRIGGER_HOVERS.some((range) => within(moment.t, range));
}

export function demoPins(moment: DemoMoment): DemoPin[] {
  return PINNED_TASKS.map((task) => {
    const isB = task === moment.episode.taskB;
    return {
      task,
      pressed: isB && within(moment.t, CHIP_PRESS),
      target: isB ? "chip-b" : null,
    };
  });
}

export function demoPicker(
  moment: DemoMoment,
  sessions: DemoSession[],
  locale: Locale,
): DemoPicker {
  const query = typedQuery(moment, locale);
  const running = runningTask(moment);
  const totals = todayTotals(sessions);
  const row = (task: DemoTask, index: number, target: DemoTarget | null): DemoPickerRow => ({
    task,
    highlighted: index === 0,
    running: task === running,
    pinned: PINNED_TASKS.includes(task),
    todaySec: totals.get(task) ?? 0,
    target,
  });
  if (query === "") {
    const recent = recentTasks(sessions, running);
    return {
      open: pickerOpen(moment),
      query,
      rows: recent.map((task, index) => row(task, index, null)),
      createText: null,
    };
  }
  const found = foundTasks(query, locale);
  const exact = found.some((task) => taskName(task, locale).toLowerCase() === query.toLowerCase());
  return {
    open: pickerOpen(moment),
    query,
    rows: found.map((task, index) =>
      row(task, index, task === moment.episode.taskA ? "found-row" : null),
    ),
    createText: exact ? null : query,
  };
}

export function projectShares(sessions: DemoSession[]): DemoProjectShare[] {
  return DEMO_PROJECTS.map((project) => ({
    project,
    seconds: sessions
      .filter((session) => taskProject(session.task) === project)
      .reduce((sum, session) => sum + sessionSec(session), 0),
  }));
}

export function totalSec(sessions: DemoSession[]): number {
  return sessions.reduce((sum, session) => sum + sessionSec(session), 0);
}

export function parallelSec(sessions: DemoSession[]): number {
  return sessions
    .filter((session) => session.lane === 1)
    .reduce((sum, session) => sum + sessionSec(session), 0);
}

export function sessionSec(session: DemoSession): number {
  return (session.endMin - session.startMin) * SECONDS_PER_MINUTE;
}

export function waypointAt(t: number): DemoTarget {
  return WAYPOINTS.filter(([from]) => t >= from).at(-1)?.[1] ?? "home";
}

export function activeClicks(t: number): number[] {
  return DEMO_CLICKS.filter((click) => t >= click && t < click + DEMO_CLICK_MS);
}

export function cursorPressed(t: number): boolean {
  return DEMO_CLICKS.some((click) => t >= click && t < click + DEMO_PRESS_MS);
}

function episodeOf(cycle: number): DemoEpisode {
  const episode = EPISODES[cycle % EPISODES.length];
  if (episode === undefined) throw new RangeError(`No demo episode for cycle ${cycle}`);
  return episode;
}

function minutesIntoCycle(t: number): number {
  for (let index = 1; index < CLOCK_POINTS.length; index += 1) {
    const [toMs, toMin] = CLOCK_POINTS[index] ?? [0, 0];
    const [fromMs, fromMin] = CLOCK_POINTS[index - 1] ?? [0, 0];
    if (t < toMs) return fromMin + ((toMin - fromMin) * (t - fromMs)) / (toMs - fromMs);
  }
  return MINUTES_PER_CYCLE;
}

function cycleSessions(cycle: number, moment: DemoMoment): DemoSession[] {
  const current = cycle === moment.cycle;
  const episode = episodeOf(cycle);
  const startMin = FIRST_CYCLE_START_MIN + MINUTES_PER_CYCLE * cycle;
  const bStarted = !current || moment.t >= TIMERS.b.startsAt;
  const sessions: DemoSession[] = [];
  if (!current || moment.t >= TIMERS.a.startsAt) {
    sessions.push(cycleSession(cycle, "a", episode.taskA, startMin, moment, current, bStarted));
  }
  if (bStarted) {
    sessions.push(cycleSession(cycle, "b", episode.taskB, startMin, moment, current, true));
  }
  return sessions;
}

function cycleSession(
  cycle: number,
  timer: DemoTimerId,
  task: DemoTask,
  cycleStartMin: number,
  moment: DemoMoment,
  current: boolean,
  parallel: boolean,
): DemoSession {
  const { startMin, endMin, stopsAt } = TIMERS[timer];
  const running = current && moment.t < stopsAt;
  return {
    id: `${cycle}-${timer}`,
    task,
    startMin: cycleStartMin + startMin,
    endMin: running ? moment.nowMin : cycleStartMin + endMin,
    running,
    lane: timer === "a" ? 0 : 1,
    lanes: parallel ? 2 : 1,
  };
}

function timerOf(id: DemoTimerId, task: DemoTask, moment: DemoMoment): DemoTimer {
  const { startMin, endMin, startsAt, stopsAt, pressedFrom } = TIMERS[id];
  const started = moment.t >= startsAt;
  const elapsedMin = Math.min(moment.nowMin, moment.cycleStartMin + endMin) - moment.cycleStartMin;
  return {
    id,
    task,
    startMin: moment.cycleStartMin + startMin,
    seconds: started ? (elapsedMin - startMin) * SECONDS_PER_MINUTE : 0,
    shown: within(moment.t, [startsAt, stopsAt]),
    stopPressed: within(moment.t, [pressedFrom, stopsAt]),
  };
}

function pickerOpen(moment: DemoMoment): boolean {
  return within(moment.t, FIRST_PICKER) || within(moment.t, SECOND_PICKER);
}

function typedQuery(moment: DemoMoment, locale: Locale): string {
  if (!within(moment.t, FIRST_PICKER) || moment.t < QUERY_STARTS_MS) return "";
  const typed = Math.floor((moment.t - QUERY_STARTS_MS) / QUERY_CHAR_MS) + 1;
  return t(locale, moment.episode.query).slice(0, typed);
}

function runningTask(moment: DemoMoment): DemoTask | null {
  return within(moment.t, [TIMERS.a.startsAt, TIMERS.a.stopsAt]) ? moment.episode.taskA : null;
}

function todayTotals(sessions: DemoSession[]): Map<DemoTask, number> {
  const totals = new Map<DemoTask, number>();
  sessions.forEach((session) =>
    totals.set(session.task, (totals.get(session.task) ?? 0) + sessionSec(session)),
  );
  return totals;
}

function recentTasks(sessions: DemoSession[], running: DemoTask | null): DemoTask[] {
  const finished = sessions
    .filter((session) => !session.running)
    .sort((first, second) => second.endMin - first.endMin)
    .map((session) => session.task);
  const unique = [...new Set(finished)];
  if (running === null) return unique.slice(0, RECENT_LIMIT);
  return [running, ...unique.filter((task) => task !== running)].slice(0, RECENT_LIMIT);
}

function foundTasks(query: string, locale: Locale): DemoTask[] {
  const needle = query.toLowerCase();
  return SEARCH_ORDER.filter((task) => {
    const title = taskName(task, locale).toLowerCase();
    const project = t(locale, PROJECT_NAMES[taskProject(task)]).toLowerCase();
    return title.includes(needle) || project.includes(needle);
  }).slice(0, SEARCH_LIMIT);
}

function within(t: number, [from, to]: [number, number]): boolean {
  return t >= from && t < to;
}
