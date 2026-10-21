-- Ejecutar en un proyecto Supabase FREE dedicado a PLANO. No activa facturación.
begin;
create table if not exists public.plano_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (length(owner_id) between 1 and 128),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  name text not null check (length(name) between 1 and 180),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  state text not null default 'pending' check (state in ('pending','ready','deleting')),
  deletion_source_state text check (deletion_source_state in ('pending','ready')),
  revision integer not null default 0,
  payload jsonb not null default '{"version":1,"annotations":[]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,fingerprint),
  check (octet_length(payload::text) <= 400000)
);
create index if not exists plano_projects_owner on public.plano_projects(owner_id,updated_at desc);
create table if not exists public.plano_usage (
  month date not null,
  owner_id text not null,
  requests integer not null default 0,
  transfer_bytes bigint not null default 0,
  minute timestamptz not null default date_trunc('minute',now()),
  minute_requests integer not null default 0,
  primary key(month,owner_id)
);
alter table public.plano_projects enable row level security;
alter table public.plano_usage enable row level security;
-- No hay políticas de cliente. Solo la función del servidor puede acceder.
revoke all on public.plano_projects,public.plano_usage from public,anon,authenticated;
grant all on public.plano_projects,public.plano_usage to service_role;

create or replace function public.plano_cloud(p_owner text,p_action text,p_id uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item public.plano_projects;
  usage_row public.plano_usage;
  month_start date := date_trunc('month',now())::date;
  reserve_bytes bigint := 4096;
  summary jsonb;
begin
  if p_owner is null or length(p_owner) not between 1 and 128 or p_owner='*' then raise exception 'INVALID_OWNER'; end if;
  if p_action not in ('list','read','download','reserve','ready','save','rename','delete_begin','delete_finish','delete_cancel') then raise exception 'INVALID_ACTION'; end if;
  -- Serializar admisión, límites y revisiones: dos peticiones no reservan el mismo espacio.
  perform pg_advisory_xact_lock(192830617);
  if p_action='list' then reserve_bytes:=65536; end if;
  if p_action in ('read','reserve','ready') then reserve_bytes:=450000; end if;
  -- Reserva conservadora: descarga Storage + respuesta de la función.
  if p_action='download' then reserve_bytes:=20971520; end if;
  insert into public.plano_usage(month,owner_id) values(month_start,'*'),(month_start,p_owner) on conflict do nothing;
  select * into usage_row from public.plano_usage where month=month_start and owner_id='*';
  if usage_row.requests>=40000 or usage_row.transfer_bytes+reserve_bytes>3000000000 then raise exception 'GLOBAL_MONTH_LIMIT'; end if;
  select * into usage_row from public.plano_usage where month=month_start and owner_id=p_owner;
  if usage_row.requests>=8000 then raise exception 'USER_MONTH_LIMIT'; end if;
  if usage_row.minute=date_trunc('minute',now()) and usage_row.minute_requests>=90 then raise exception 'RATE_LIMIT'; end if;
  update public.plano_usage set requests=requests+1,transfer_bytes=transfer_bytes+reserve_bytes,
    minute_requests=case when minute=date_trunc('minute',now()) then minute_requests+1 else 1 end,
    minute=date_trunc('minute',now())
    where month=month_start and owner_id in ('*',p_owner);
  if p_action='list' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at desc),'[]') into summary from
      (select id,name,fingerprint,size_bytes,state,revision,created_at,updated_at from public.plano_projects where owner_id=p_owner) t;
    return jsonb_build_object('projects',summary,'limits',jsonb_build_object('fileBytes',10485760,'projectsPerUser',10));
  end if;
  if p_action='reserve' then
    select * into item from public.plano_projects where owner_id=p_owner and fingerprint=p_data->>'fingerprint';
    if found then return to_jsonb(item)||jsonb_build_object('created',false); end if;
    if (select count(*) from public.plano_projects where owner_id=p_owner)>=10 then raise exception 'USER_STORAGE_LIMIT'; end if;
    -- Cada reserva cuenta como 10 MiB, incluso si el PDF es menor. Máximo 800 MiB.
    if (select count(*) from public.plano_projects)>=80 then raise exception 'GLOBAL_STORAGE_LIMIT'; end if;
    insert into public.plano_projects(owner_id,fingerprint,name,size_bytes)
      values(p_owner,p_data->>'fingerprint',p_data->>'name',(p_data->>'size_bytes')::integer) returning * into item;
    return to_jsonb(item)||jsonb_build_object('created',true);
  end if;
  select * into item from public.plano_projects where id=p_id and owner_id=p_owner for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action in ('read','download') then
    if item.state<>'ready' then raise exception 'NOT_READY'; end if;
    return to_jsonb(item);
  end if;
  if p_action='ready' then
    if item.state<>'pending' then raise exception 'CONFLICT'; end if;
    update public.plano_projects set state='ready' where id=p_id returning * into item;
    return to_jsonb(item);
  end if;
  if p_action in ('save','rename','delete_begin') then
    if item.revision<>(p_data->>'revision')::integer or not (p_data ? 'revision') then raise exception 'CONFLICT'; end if;
    if item.state='deleting' and p_action<>'delete_begin' then raise exception 'CONFLICT'; end if;
    if p_action in ('save','rename') and item.state<>'ready' then raise exception 'NOT_READY'; end if;
    if p_action='save' then
      if p_data->'payload' is null or jsonb_typeof(p_data->'payload')<>'object' or (p_data->'payload'->>'version') is distinct from '1' or jsonb_typeof(p_data->'payload'->'annotations')<>'array'
         or not(p_data->'payload' ? 'annotations') or octet_length((p_data->'payload')::text)>400000 then raise exception 'INVALID_PAYLOAD'; end if;
      if p_data->'payload' ? 'fingerprint' and p_data->'payload'->>'fingerprint'<>item.fingerprint then raise exception 'INVALID_PAYLOAD'; end if;
      update public.plano_projects set payload=p_data->'payload',revision=revision+1,updated_at=now() where id=p_id returning * into item;
    elsif p_action='rename' then
      update public.plano_projects set name=p_data->>'name',revision=revision+1,updated_at=now() where id=p_id returning * into item;
    else
      update public.plano_projects set deletion_source_state=case when state='deleting' then deletion_source_state else state end,state='deleting' where id=p_id returning * into item;
    end if;
    return to_jsonb(item)-'payload';
  end if;
  if p_action='delete_cancel' then
    if item.state<>'deleting' then raise exception 'CONFLICT'; end if;
    update public.plano_projects set state=deletion_source_state,deletion_source_state=null where id=p_id;
    return jsonb_build_object('ok',true);
  end if;
  if p_action='delete_finish' then
    if item.state<>'deleting' then raise exception 'CONFLICT'; end if;
    delete from public.plano_projects where id=p_id;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'INVALID_ACTION';
end $$;
revoke all on function public.plano_cloud(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.plano_cloud(text,text,uuid,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('plano-pdfs','plano-pdfs',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];
-- Las tablas/objetos no se exponen mediante claves públicas. No crear políticas públicas para este bucket.
commit;
