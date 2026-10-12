// Usability-session tooling for observing real families. Local to the browser; no names are collected.
export const TASKS = ['choose_trade', 'find_salary', 'find_human_help', 'explain_nsqf'] as const;
export type TaskKey = (typeof TASKS)[number];
export type TaskResult = 'unaided' | 'with_help' | 'failed';
export interface Observation {
  id: string; // participant code, e.g. P01. Never a name.
  role: 'learner' | 'parent';
  language: string;
  literacy: 'low' | 'medium' | 'high';
  tasks: Record<TaskKey, TaskResult>;
  seconds: number | null; // time to reach the summary card
  quote: string;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

export function summarize(obs: Observation[]) {
  const perTask = Object.fromEntries(
    TASKS.map((t) => {
      const n = obs.length;
      const c = (r: TaskResult) => obs.filter((o) => o.tasks[t] === r).length;
      return [t, { unaided_pct: pct(c('unaided'), n), with_help_pct: pct(c('with_help'), n), failed_pct: pct(c('failed'), n) }];
    }),
  ) as Record<TaskKey, { unaided_pct: number | null; with_help_pct: number | null; failed_pct: number | null }>;
  const timed = obs.filter((o) => o.seconds != null).map((o) => o.seconds as number);
  return {
    participants: obs.length,
    low_literacy: obs.filter((o) => o.literacy === 'low').length,
    parents: obs.filter((o) => o.role === 'parent').length,
    languages: Array.from(new Set(obs.map((o) => o.language))),
    avg_seconds: timed.length ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : null,
    per_task: perTask,
  };
}

// CSV cells starting with = + - @ are prefixed with ' so spreadsheets never run them as formulas.
const cell = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
export function toCsv(obs: Observation[]) {
  const head = ['participant', 'role', 'language', 'literacy', ...TASKS, 'seconds', 'quote'];
  const rows = obs.map((o) => [o.id, o.role, o.language, o.literacy, ...TASKS.map((t) => o.tasks[t]), o.seconds ?? '', o.quote]);
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}
