// SYNTHETIC demo fixtures for the staff dashboards. Served ONLY when demo mode is
// explicitly enabled and the caller is not signed in. Never presented as real data.
export const TELANGANA_DISTRICTS = [
  'Adilabad','Bhadradri Kothagudem','Hanumakonda','Hyderabad','Jagtial','Jangaon','Jayashankar Bhupalpally',
  'Jogulamba Gadwal','Kamareddy','Karimnagar','Khammam','Kumuram Bheem Asifabad','Mahabubabad','Mahabubnagar',
  'Mancherial','Medak','Medchal-Malkajgiri','Mulugu','Nagarkurnool','Nalgonda','Narayanpet','Nirmal','Nizamabad',
  'Peddapalli','Rajanna Sircilla','Rangareddy','Sangareddy','Siddipet','Suryapet','Vikarabad','Wanaparthy',
  'Warangal','Yadadri Bhuvanagiri',
];

const seeded = (i: number, salt: number) => {
  const x = Math.sin((i + 1) * 9301 + salt * 49297) * 233280;
  return x - Math.floor(x);
};

export function demoAdminMetrics() {
  const heatmap = TELANGANA_DISTRICTS.map((district, i) => ({
    district,
    state: 'Telangana',
    session_count: 18 + Math.floor(seeded(i, 1) * 140),
    resistance_index: Math.round((22 + seeded(i, 2) * 62) * 10) / 10,
    share_neg_start: Math.round(seeded(i, 3) * 55) / 100,
    escalation_rate: Math.round(seeded(i, 4) * 30) / 100,
  }));
  const total = heatmap.reduce((n, d) => n + d.session_count, 0);
  const concern = { income_potential: 38, social_perception_status: 27, job_security: 19, safety_risk: 9, further_education: 7 };
  const unresolved = { social_perception_status: 11, income_potential: 8, job_security: 5, safety_risk: 3 };
  return {
    is_demo: true,
    insufficient_data: false,
    total_sessions: total,
    heatmap,
    objections: concern,
    kpis: {
      counselling_volume: total,
      unresolved_concerns: 27,
      escalation_rate: 0.14,
      escalation_rate_label: '14%',
    },
    concern_distribution: concern,
    unresolved_concerns_by_category: unresolved,
    concern_state_change: { resolved: 64, unresolved: 27, label: '70% of concerns resolved after one conversation' },
    geographic_distribution: Object.fromEntries([...heatmap].sort((a, b) => b.session_count - a.session_count).slice(0, 8).map((d) => [d.district, d.session_count])),
    engagement_funnel: [{ stage: 'sessions', count: 520 }, { stage: 'trades_viewed', count: 412 }, { stage: 'summary_shared', count: 131 }, { stage: 'escalated', count: 74 }],
    trade_distribution: { Electrician: 41, 'Solar Technician': 28, 'Food Processing': 17, Plumber: 14 },
    language_distribution: { Telugu: 61, English: 22, Hindi: 12, Tamil: 5 },
    provider_distribution: { 'Government ITI': 48, 'PMKVY centre': 31, 'Private accredited': 21 },
  };
}

export function demoCounsellorQueue() {
  const now = Date.now();
  const mk = (n: number, hrs: number, district: string, role: string, trade: string, reason: string, summary: string) => ({
    id: `demo-${n}`,
    session_id: `demo-session-${n}`,
    reason,
    summary: `[DEMO] ${summary}`,
    status: n === 4 ? 'accepted' : 'pending',
    created_at: new Date(now - hrs * 3600_000).toISOString(),
    family_profile: { district, state: 'Telangana', role, learner_class: 'Class 10', income_bracket: '₹1 - 3 Lakhs', trade_name: trade },
  });
  return [
    mk(1, 1, 'Adilabad', 'Parent', 'Electrician', 'Parent unconvinced about status of a trade vs degree', 'Father prefers a degree. Worried neighbours will see ITI as a lower route.'),
    mk(2, 3, 'Nizamabad', 'Learner', 'Solar Technician', 'Family asked for a live counsellor', 'Learner is keen; family needs reassurance on safety of rooftop work.'),
    mk(3, 5, 'Mahabubabad', 'Parent', 'Food Processing', 'Income concern not resolved', 'Mother asked about first-year earnings and loan options.'),
    mk(4, 9, 'Karimnagar', 'Both', 'Electrician', 'Callback requested', 'Family wants to compare a diploma with the NSQF ladder.'),
  ];
}
