-- HQI PHC Quick Dashboard - Supabase setup
create table if not exists hqi_indicators (
  id bigserial primary key,
  code text unique not null,
  name text not null,
  description text,
  denominator_description text,
  facility_type text default 'PHC',
  default_target numeric default 80,
  created_at timestamptz default now()
);

create table if not exists hqi_entries (
  id bigserial primary key,
  center text not null,
  month text not null,
  indicator_code text not null references hqi_indicators(code) on delete cascade,
  numerator numeric,
  denominator numeric,
  notes text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(center, month, indicator_code)
);

-- مؤشرات المراكز الصحية فقط، المستخرجة من ملف EJH - HQI 2026.xlsx
insert into hqi_indicators (code, name, description, denominator_description, facility_type, default_target) values
('4.3.3.', 'Diabetes Screening', 'Number of PHCC visitors (40 years and above, BMI ≥ 25) screened for abnormal blood glucose at least once in the last 3 years', 'Total count of eligible targeted population', 'PHC', 80),
('4.3.2.', 'Obesity Screening', 'Number of PHCC visitors (2 years -and above) with a documented BMI during the physician encounter or during the previous twelve months', 'Total count of eligible targeted population', 'PHC', 80),
('4.3.1.', 'Hypertension Screening', 'Number of PHCC visitors 18 years and above with documented screening of hypertension', 'Total count of eligible targeted population', 'PHC', 80),
('4.3.6.', 'Breast Cancer Screening', 'Number of women aged 40−69 years with one or more mammograms during the measurement period or the 15 months prior to the measurement period', 'Total count of eligible targeted population', 'PHC', 80),
('4.3.5.', 'Colorectal Cancer Screening', 'Number of PHCCs visitors aged 45 years and above screened for colorectal cancer by fecal immunochemical test (FIT) during the measurement period or the two years prior to the measurement period', 'Total count of eligible targeted population', 'PHC', 80),
('4.3.8.', 'Premarital Screening', 'Number of individuals who completed the required premarital screening test', 'Total count of eligible population', 'PHC', 80),
('4.3.7.', 'Mental Health Screening', 'Patients aged 18 years and older with documented screening for depression or anxiety on the date of the encounter or up to 12 months prior to the date of the encounter using an age-appropriate standardized tool', 'Total count of eligible targeted population', 'PHC', 80),
('4.3.9.', 'Newborn Screening', 'Number of newborns screened for genetic disorders', 'Total count of live births', 'PHC', 80),
('4.3.4', 'Dyslipidemia Screening', 'Number of PHCC visitors (40 years and above) who had a complete lipid profile performed for screening of dyslipidemia within 5 years prior to the end of reporting', 'Total count of eligible targeted population', 'PHC', 80),
('4.1.1.', 'Enrollment Rate for Top Five Diagnoses into Established Clinical Pathways', 'Number of patients enrolled within the pathway in accordance to enrollment calculation', 'Total number of patients discharged under the top five diagnosis', 'PHC', 80),
('2.3.1.', 'Patients Seen in Virtual Clinic', 'Total number of patients who were seen in the Virtual clinics', 'Total OPD patients', 'PHC', 80),
('2.1.3.', 'Days to Third Next Available Appointment', 'The average number of calendar days (including weekends) until the third next available appointment in outpatient clinics (all specialties including primary care if available)', 'The total number of sampled admitted patients within the assessment period', 'PHC', 80),
('3.2.2.', 'Hand Hygiene Compliance', 'The total number of compliant hand hygiene opportunities', 'The total number of HH opportunities observe', 'PHC', 80),
('1.1.1.', 'Patient Experience Score - HQI', 'Number of patients who respond, “strongly agree” to the statement, “They give me exactly the help I want [and need] exactly when I want [and need] it.', 'Number of patients surveyed', 'PHC', 80),
('1.2.2.', 'Overall Satisfaction with Complaint Resolution within 72 hours', 'Complaints who received a (satisfied, very satisfied) scoring on its  resolution/outcome by the patient, family, or others', 'Total number of responses to the complaints’ resolution survey', 'PHC', 80),
('1.2.1', 'Percentage of Complaints Resolved Within 72 hours', 'Number of complaints resolved within 72 hours from filing/submission to communication of resolution', 'Total number of complaints received', 'PHC', 80),
('3.4.3.', 'Nurse Vacancy Ratio', 'Number of vacant permanent nurse FTEs', 'Number of planned budgeted nurse workforce FTEs', 'PHC', 80),
('5.1.1', 'Staff Satisfaction Score', 'Number of staff responding either 9 or 10 on the “How likely is it that you would recommend your place of work to a friend or acquaintance as a great place to work”', 'Total number of staff surveyed', 'PHC', 80)
on conflict (code) do update set name=excluded.name, description=excluded.description, denominator_description=excluded.denominator_description, facility_type=excluded.facility_type, default_target=excluded.default_target;

alter table hqi_indicators enable row level security;
alter table hqi_entries enable row level security;

-- للاستخدام السريع اليوم: سياسات مفتوحة. عدّلها لاحقاً عند إضافة تسجيل دخول.
drop policy if exists "public read indicators" on hqi_indicators;
create policy "public read indicators" on hqi_indicators for select using (true);
drop policy if exists "public write entries" on hqi_entries;
create policy "public write entries" on hqi_entries for all using (true) with check (true);
