-- DUMMY / ILLUSTRATIVE data for the hackathon demo (the problem statement says dummy
-- placement/earnings datasets are provided for evaluation). Every row below is flagged
-- is_synthetic = true and verification_status = 'pending'. It is NOT official data.
-- Replace with the organisers' dataset or a cited source before any real use.
-- Food Processing is browseable, but intentionally has no quantitative/pathway
-- evidence here because the repository contains no verified source records for it.

begin;

insert into public.districts (state, name)
values ('Telangana', 'Warangal')
on conflict do nothing;

insert into public.trades (
  id, name_en, name_local, sector, nsqf_level, duration_months,
  entry_qualification, safety_notes, job_roles, description_simple
)
select
  13,
  'Food Processing',
  '{"te":"ఆహార ప్రాసెసింగ్","hi":"खाद्य प्रसंस्करण","ta":"உணவு பதப்படுத்துதல்"}'::jsonb,
  'Food Industry',
  4,
  12,
  'Class 10 Passed',
  'Food hygiene, equipment safety, and quality-control procedures',
  '["Food Processing Operator","Food Packaging Technician","Quality Control Assistant"]'::jsonb,
  '{"en":"Food preparation, processing, packaging, and quality control."}'::jsonb
where not exists (
  select 1 from public.trades where name_en = 'Food Processing'
);

insert into public.data_sources (
  publisher, title, source_url, document_reference, retrieved_on
)
select
  'Hackathon evaluation dataset (dummy)',
  'Dummy placement and earnings data for SIH 2026, problem statement 26241 (illustrative only, not official statistics)',
  null,
  'dummy-evaluation-dataset-v1',
  current_date
where not exists (
  select 1 from public.data_sources
  where document_reference = 'dummy-evaluation-dataset-v1'
);

insert into public.providers (
  name, type, state, district, accreditation, fee_inr, contact, verified, is_synthetic, source_id
)
select
  'Sample Government ITI, Warangal (dummy)',
  'Government ITI',
  'Telangana',
  'Warangal',
  'Not available',
  0,
  null,
  false,
  true,
  s.id
from public.data_sources s
where s.document_reference = 'dummy-evaluation-dataset-v1'
  and not exists (
    select 1 from public.providers p
    where p.name = 'Sample Government ITI, Warangal (dummy)'
      and p.state = 'Telangana'
      and p.district = 'Warangal'
  );

insert into public.pathways (
  from_trade_id, step_order, step_title, nsqf_level, next_education,
  typical_role, typical_salary_range, source_id, verification_status, is_synthetic
)
select
  t.id,
  v.step_order,
  v.step_title,
  v.nsqf_level,
  v.next_education,
  v.typical_role,
  v.typical_salary_range,
  s.id,
  'pending',
  true
from public.trades t
cross join public.data_sources s
cross join (
  values
    (1, 'Certified Electrician', 4, 'Advanced Diploma / CITS Certification', 'Site Electrician / Panel Maintenance Technician', '₹14,000 - ₹18,000'),
    (2, 'Lead Technician & Section Supervisor', 5, 'Polytechnic Lateral Entry (Direct 2nd Year) or B.Voc', 'Maintenance Supervisor / Licensed Electrical Contractor', '₹24,000 - ₹35,000'),
    (3, 'Electrical Systems Project Manager / Entrepreneur', 6, 'B.Tech Lateral Entry or Advanced Skill Diploma', 'Assistant Project Engineer / Solar Project In-Charge', '₹45,000 - ₹65,000')
) as v(step_order, step_title, nsqf_level, next_education, typical_role, typical_salary_range)
where t.name_en = 'Electrician'
  and s.document_reference = 'dummy-evaluation-dataset-v1'
  and not exists (
    select 1 from public.pathways p
    where p.from_trade_id = t.id and p.step_order = v.step_order
      and p.is_synthetic = true
  );

insert into public.outcome_metrics (
  trade_id, provider_id, state, district, metric_key, metric_value, unit,
  year, sample_size, source_id, verification_date, verification_status,
  data_quality, confidence, is_synthetic
)
select
  t.id,
  p.id,
  'Telangana',
  'Warangal',
  v.metric_key,
  v.metric_value,
  v.unit,
  2024,
  v.sample_size,
  s.id,
  null::date,
  'pending',
  'unknown',
  null,
  true
from public.trades t
join public.providers p
  on p.name = 'Sample Government ITI, Warangal (dummy)'
 and p.state = 'Telangana'
 and p.district = 'Warangal'
cross join public.data_sources s
cross join (
  values
    ('placement_rate', 78.4::numeric, 'percentage', 42, 0.960::numeric),
    ('starting_earnings', 16500::numeric, 'INR', 42, 0.950::numeric),
    ('earnings_after_period', 26000::numeric, 'INR', 38, 0.920::numeric)
) as v(metric_key, metric_value, unit, sample_size, confidence)
where t.name_en = 'Electrician'
  and s.document_reference = 'dummy-evaluation-dataset-v1'
  and not exists (
    select 1 from public.outcome_metrics m
    where m.trade_id = t.id
      and m.provider_id = p.id
      and m.district = 'Warangal'
      and m.metric_key = v.metric_key
      and m.year = 2024
      and m.is_synthetic = true
  );

commit;
