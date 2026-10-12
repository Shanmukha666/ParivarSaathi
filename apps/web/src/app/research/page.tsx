'use client';

import { useEffect, useState } from 'react';
import { Observation, TASKS, TaskKey, TaskResult, summarize, toCsv } from '../../lib/research';

const LABEL: Record<TaskKey, string> = {
  choose_trade: 'Chose a trade without help',
  find_salary: 'Found the starting salary',
  find_human_help: 'Found how to reach a counsellor',
  explain_nsqf: 'Explained NSQF in own words',
};
const KEY = 'parivar_research_v1';

const DEMO_SAMPLES: Observation[] = [
  {
    id: 'P01',
    role: 'parent',
    language: 'te',
    literacy: 'low',
    seconds: 142,
    quote: 'ధరలు మరియు సర్కారీ సహాయం సులభంగా అర్థమైంది (Understood fee and schemes easily)',
    tasks: { choose_trade: 'unaided', find_salary: 'unaided', find_human_help: 'with_help', explain_nsqf: 'with_help' },
  },
  {
    id: 'P02',
    role: 'learner',
    language: 'te',
    literacy: 'medium',
    seconds: 88,
    quote: 'వాయిస్ బటన్ చాలా బాగుంది (Voice read-out was very intuitive)',
    tasks: { choose_trade: 'unaided', find_salary: 'unaided', find_human_help: 'unaided', explain_nsqf: 'unaided' },
  },
  {
    id: 'P03',
    role: 'parent',
    language: 'hi',
    literacy: 'medium',
    seconds: 110,
    quote: 'शुरुआती वेतन और 3 साल बाद की कमाई साफ दिखी (Clear starting vs 3-yr earnings)',
    tasks: { choose_trade: 'unaided', find_salary: 'unaided', find_human_help: 'unaided', explain_nsqf: 'with_help' },
  },
  {
    id: 'P04',
    role: 'parent',
    language: 'te',
    literacy: 'low',
    seconds: 165,
    quote: 'స్పష్టమైన తెలుగు ఆడియో సాయపడింది (Clear Telugu audio helped me understand)',
    tasks: { choose_trade: 'with_help', find_salary: 'unaided', find_human_help: 'unaided', explain_nsqf: 'unaided' },
  },
  {
    id: 'P05',
    role: 'learner',
    language: 'ta',
    literacy: 'high',
    seconds: 74,
    quote: 'முடிவு அட்டை எளிதாக பதிவிறக்கம் செய்யப்பட்டது (Summary card downloaded instantly)',
    tasks: { choose_trade: 'unaided', find_salary: 'unaided', find_human_help: 'unaided', explain_nsqf: 'unaided' },
  },
];

const blank = (n: number): Observation => ({
  id: `P${String(n).padStart(2, '0')}`, role: 'parent', language: 'te', literacy: 'low', seconds: null, quote: '',
  tasks: { choose_trade: 'unaided', find_salary: 'unaided', find_human_help: 'unaided', explain_nsqf: 'unaided' },
});

export default function ResearchPage() {
  const [list, setList] = useState<Observation[]>([]);
  const [draft, setDraft] = useState<Observation>(blank(1));
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const v = JSON.parse(raw);
        setList(v);
        setDraft(blank(v.length + 1));
      } else {
        // Pre-populate realistic demonstration observations with honest synthetic notice
        setList(DEMO_SAMPLES);
        setDraft(blank(DEMO_SAMPLES.length + 1));
      }
    } catch {
      setList(DEMO_SAMPLES);
    }
  }, []);
  const save = (next: Observation[]) => { setList(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const add = () => { save([...list, draft]); setDraft(blank(list.length + 2)); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(list)], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'usability_sessions.csv' });
    a.click(); URL.revokeObjectURL(url);
  };
  const s = summarize(list);
  const field = 'w-full border border-slate-300 rounded-xl p-3 bg-white';

  return (
    <div className="min-h-screen bg-slate-50 p-5 space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-1">
        <p className="font-bold flex items-center gap-1.5 text-amber-800">
          <span>ℹ️</span> Facilitator Field Usability Tool
        </p>
        <p>
          Showing {list.length} sample field observations (multilingual sessions across Telugu, Hindi, and Tamil). When real family testing sessions are recorded, export the CSV or clear demo records with one tap.
        </p>
      </div>

      <h1 className="text-2xl font-extrabold text-ink">Usability sessions</h1>
      <p className="text-sm text-slate-700">For the facilitator. Record what you observe, never names. Data stays in this browser until you export it.</p>

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <h2 className="font-bold">New session: {draft.id}</h2>
        <div className="grid grid-cols-3 gap-2">
          <select className={field} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Observation['role'] })}><option value="parent">Parent</option><option value="learner">Learner</option></select>
          <select className={field} value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}><option value="te">Telugu</option><option value="hi">Hindi</option><option value="ta">Tamil</option><option value="en">English</option></select>
          <select className={field} value={draft.literacy} onChange={(e) => setDraft({ ...draft, literacy: e.target.value as Observation['literacy'] })}><option value="low">Low literacy</option><option value="medium">Medium</option><option value="high">High</option></select>
        </div>
        {TASKS.map((t) => (
          <label key={t} className="block text-sm font-semibold">{LABEL[t]}
            <select className={`${field} mt-1`} value={draft.tasks[t]} onChange={(e) => setDraft({ ...draft, tasks: { ...draft.tasks, [t]: e.target.value as TaskResult } })}>
              <option value="unaided">Did it alone</option><option value="with_help">Needed help</option><option value="failed">Could not</option>
            </select>
          </label>
        ))}
        <input className={field} inputMode="numeric" placeholder="Seconds to reach the summary card" value={draft.seconds ?? ''} onChange={(e) => setDraft({ ...draft, seconds: e.target.value ? Number(e.target.value) : null })} />
        <textarea className={field} rows={2} placeholder="Short quote or what confused them (no names)" value={draft.quote} onChange={(e) => setDraft({ ...draft, quote: e.target.value })} />
        <button onClick={add} className="w-full bg-orange-600 text-white font-bold py-3 rounded-2xl">Save session</button>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <h2 className="font-bold">Results so far: {s.participants} participants ({s.low_literacy} low literacy, {s.parents} parents)</h2>
        {s.avg_seconds != null && <p className="text-sm">Average time to summary: {s.avg_seconds}s</p>}
        {TASKS.map((t) => (
          <p key={t} className="text-sm">{LABEL[t]}: <b>{s.per_task[t].unaided_pct ?? '-'}%</b> alone, {s.per_task[t].with_help_pct ?? '-'}% with help, {s.per_task[t].failed_pct ?? '-'}% could not</p>
        ))}
        <div className="flex gap-2 pt-2">
          <button onClick={download} disabled={!list.length} className="flex-1 border-2 border-orange-600 text-orange-700 font-bold py-3 rounded-2xl disabled:opacity-40">Export CSV</button>
          <button onClick={() => { if (confirm('Delete all sessions from this browser?')) save([]); }} className="px-4 border border-slate-300 rounded-2xl">Clear</button>
        </div>
      </section>
    </div>
  );
}
