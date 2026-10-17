-- Applied to the Supabase project via the MCP `apply_migration` tool (migration name: aicheck_public_tables_with_rls).
-- The browser talks to Supabase directly with the publishable key. Everything is protected by RLS, column grants,
-- CHECK constraints and a lead trigger. Tables are prefixed aicheck_ so they never mix with other apps in this project.

create or replace function public.aicheck_valid_answers(a jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(a) = 'object'
     and (select count(*) from jsonb_object_keys(a)) = 20
     and not exists (
       select 1
         from unnest(array['t1','t2','t3','t4','t5','d1','d2','d3','d4','d5','a1','a2','a3','a4','a5','i1','i2','i3','i4','i5']) as k
        where not (a ? k) or jsonb_typeof(a -> k) <> 'number' or (a ->> k) not in ('0','1','2')
     )
$$;

create table public.aicheck_assessments (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  checklist_version integer not null,
  answers jsonb not null check (public.aicheck_valid_answers(answers)),
  created_at timestamptz not null default now()
);
create index aicheck_assessments_user_idx on public.aicheck_assessments (user_id, id);

create table public.aicheck_consultations (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  assessment_id bigint not null references public.aicheck_assessments(id) on delete cascade,
  phone text check (phone is null or phone ~ '^[0-9+()\-\s]{7,30}$'),
  preferred_time text not null check (preferred_time in ('morning', 'afternoon', 'any')),
  topics jsonb not null default '[]'::jsonb check (jsonb_typeof(topics) = 'array' and topics <@ '["tools","data","access","incident","it-support"]'::jsonb),
  message text check (message is null or char_length(message) <= 1000),
  consent_given boolean not null check (consent_given),
  status text not null default 'new',
  created_at timestamptz not null default now(),
  unique (user_id, assessment_id)
);
create index aicheck_consultations_assessment_idx on public.aicheck_consultations (assessment_id);

create table public.aicheck_leads (
  id bigint generated always as identity primary key,
  email text not null check (email = lower(email) and email ~ '^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$'),
  company_name text not null check (char_length(company_name) between 1 and 100),
  phone text check (phone is null or phone ~ '^[0-9+()\-\s]{7,30}$'),
  answers jsonb check (answers is null or public.aicheck_valid_answers(answers)),
  checklist_version integer,
  source text not null check (source in ('check', 'call', 'template')),
  consent_given boolean not null check (consent_given),
  status text not null default 'new',
  client_ip text,
  created_at timestamptz not null default now(),
  check (source <> 'check' or answers is not null)
);
create index aicheck_leads_dedupe_idx on public.aicheck_leads (email, source, created_at);
create index aicheck_leads_ip_idx on public.aicheck_leads (client_ip, created_at);

-- Normalize, stamp, rate-limit per visitor (5/hour per IP), and de-duplicate (same email + source within 24h stored once).
create or replace function public.aicheck_leads_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ip text;
  n integer;
begin
  new.email := lower(btrim(new.email));
  new.company_name := btrim(new.company_name);
  new.status := 'new';
  new.created_at := now();
  begin
    ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  exception when others then
    ip := null;
  end;
  new.client_ip := ip;

  if ip is not null then
    select count(*) into n from public.aicheck_leads where client_ip = ip and created_at > now() - interval '1 hour';
    if n >= 5 then
      raise exception 'rate_limited';
    end if;
  end if;

  if exists (select 1 from public.aicheck_leads where email = new.email and source = new.source and created_at > now() - interval '1 day') then
    return null;
  end if;
  return new;
end
$$;
revoke execute on function public.aicheck_leads_before_insert() from public, anon, authenticated;
create trigger aicheck_leads_before_insert before insert on public.aicheck_leads
  for each row execute function public.aicheck_leads_before_insert();

-- Least privilege: only the columns a client may set. Nobody can read leads through the API (no SELECT grant, no policy).
revoke all on public.aicheck_assessments, public.aicheck_consultations, public.aicheck_leads from anon, authenticated;
grant select on public.aicheck_assessments to authenticated;
grant insert (checklist_version, answers) on public.aicheck_assessments to authenticated;
grant select on public.aicheck_consultations to authenticated;
grant insert (assessment_id, phone, preferred_time, topics, message, consent_given) on public.aicheck_consultations to authenticated;
grant insert (email, company_name, phone, answers, checklist_version, source, consent_given) on public.aicheck_leads to anon, authenticated;

alter table public.aicheck_assessments enable row level security;
alter table public.aicheck_consultations enable row level security;
alter table public.aicheck_leads enable row level security;

create policy "aicheck own assessments read" on public.aicheck_assessments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "aicheck own assessments insert" on public.aicheck_assessments
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "aicheck own consultations read" on public.aicheck_consultations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "aicheck own consultations insert" on public.aicheck_consultations
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.aicheck_assessments a where a.id = assessment_id and a.user_id = (select auth.uid()))
  );

create policy "aicheck anyone can submit a lead" on public.aicheck_leads
  for insert to anon, authenticated with check (true);
