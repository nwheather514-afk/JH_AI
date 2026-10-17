-- Run in the Supabase dashboard: SQL Editor (the owner's session can read; the browser/API cannot).
-- 1) Inquiries from visitors (no account): newest first.
select l.id, l.created_at, l.source, l.status, l.company_name, l.email, l.phone,
       l.answers is not null as has_check_answers, l.answers
  from public.aicheck_leads l
 order by l.id desc;

-- 2) Consultation requests from signed-in users, with who they are and their latest score inputs.
select c.id, c.created_at, c.status, u.email, u.raw_user_meta_data ->> 'company_name' as company_name,
       c.phone, c.preferred_time, c.topics, c.message, a.answers
  from public.aicheck_consultations c
  join auth.users u on u.id = c.user_id
  join public.aicheck_assessments a on a.id = c.assessment_id
 order by c.id desc;

-- 3) Mark one as handled (example):
-- update public.aicheck_leads set status = 'contacted' where id = 1;
