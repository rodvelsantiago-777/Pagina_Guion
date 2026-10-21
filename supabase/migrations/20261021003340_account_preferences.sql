-- Preferencias de interfaz por UID de Firebase, independientes de los documentos.
begin;
create table public.plano_preferences (
  owner_id text primary key check (length(owner_id) between 1 and 128 and owner_id <> '*'),
  mode text not null default 'light' check (mode in ('light','dark')),
  preset text not null default 'default' check (preset in ('default','red','brown','orange','yellow','green','sky','blue','pink','violet','gray','graphite')),
  updated_at timestamptz not null default now()
);
alter table public.plano_preferences enable row level security;
revoke all on public.plano_preferences from public,anon,authenticated;
grant all on public.plano_preferences to service_role;

create function public.plano_preferences(p_owner text,p_action text,p_patch jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item public.plano_preferences;
  usage_row public.plano_usage;
  month_start date := date_trunc('month',now())::date;
begin
  if p_owner is null or length(p_owner) not between 1 and 128 or p_owner='*' then raise exception 'INVALID_INPUT'; end if;
  if p_action is null or p_action not in ('read','save') then raise exception 'INVALID_INPUT'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'INVALID_INPUT'; end if;
  if p_action='save' then
    if p_patch='{}'::jsonb or (p_patch - 'mode' - 'preset')<>'{}'::jsonb
      or (p_patch ? 'mode' and (jsonb_typeof(p_patch->'mode')<>'string' or p_patch->>'mode' not in ('light','dark')))
      or (p_patch ? 'preset' and (jsonb_typeof(p_patch->'preset')<>'string' or p_patch->>'preset' not in ('default','red','brown','orange','yellow','green','sky','blue','pink','violet','gray','graphite')))
    then raise exception 'INVALID_INPUT'; end if;
  end if;
  -- Comparte cuotas y bloqueo con plano_cloud; no añade sondeo ni otro servicio.
  perform pg_advisory_xact_lock(192830617);
  insert into public.plano_usage(month,owner_id) values(month_start,'*'),(month_start,p_owner) on conflict do nothing;
  select * into usage_row from public.plano_usage where month=month_start and owner_id='*';
  if usage_row.requests>=40000 or usage_row.transfer_bytes+4096>3000000000 then raise exception 'GLOBAL_MONTH_LIMIT'; end if;
  select * into usage_row from public.plano_usage where month=month_start and owner_id=p_owner;
  if usage_row.requests>=8000 then raise exception 'USER_MONTH_LIMIT'; end if;
  if usage_row.minute=date_trunc('minute',now()) and usage_row.minute_requests>=90 then raise exception 'RATE_LIMIT'; end if;
  update public.plano_usage set requests=requests+1,transfer_bytes=transfer_bytes+4096,
    minute_requests=case when minute=date_trunc('minute',now()) then minute_requests+1 else 1 end,
    minute=date_trunc('minute',now()) where month=month_start and owner_id in ('*',p_owner);
  if p_action='save' then
    if not exists(select 1 from public.plano_preferences where owner_id=p_owner)
      and (select count(*) from public.plano_preferences)>=10000 then raise exception 'GLOBAL_MONTH_LIMIT'; end if;
    -- Solo cambia los campos elegidos. Otra pestaña no borra el otro ajuste.
    insert into public.plano_preferences as saved(owner_id,mode,preset)
      values(p_owner,coalesce(p_patch->>'mode','light'),coalesce(p_patch->>'preset','default'))
      on conflict(owner_id) do update set
        mode=coalesce(p_patch->>'mode',saved.mode),preset=coalesce(p_patch->>'preset',saved.preset),updated_at=now();
  end if;
  select * into item from public.plano_preferences where owner_id=p_owner;
  if not found then return null; end if;
  return jsonb_build_object('mode',item.mode,'preset',item.preset);
end $$;
revoke all on function public.plano_preferences(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.plano_preferences(text,text,jsonb) to service_role;
commit;
