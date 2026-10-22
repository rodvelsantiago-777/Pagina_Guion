begin;
create table if not exists public.plano_release_receipts (
  owner_id text primary key check (length(owner_id) between 1 and 128 and owner_id <> '*'),
  release_id text not null check (release_id ~ '^[a-zA-Z0-9._-]{1,100}$'),
  published_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.plano_release_receipts enable row level security;
revoke all on public.plano_release_receipts from public,anon,authenticated;
grant all on public.plano_release_receipts to service_role;

create or replace function public.plano_release_receipt(p_owner text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item public.plano_release_receipts;
  usage_row public.plano_usage;
  month_start date := date_trunc('month',now())::date;
  published timestamptz;
begin
  if p_owner is null or length(p_owner) not between 1 and 128 or p_owner='*' or p_action is null or p_action not in ('read','seen') then raise exception 'INVALID_INPUT'; end if;
  if p_action='seen' then
    if p_data is null or jsonb_typeof(p_data)<>'object' or jsonb_typeof(p_data->'releaseId') is distinct from 'string'
      or p_data->>'releaseId' !~ '^[a-zA-Z0-9._-]{1,100}$' or jsonb_typeof(p_data->'publishedAt') is distinct from 'string'
    then raise exception 'INVALID_INPUT'; end if;
    begin published := (p_data->>'publishedAt')::timestamptz; exception when others then raise exception 'INVALID_INPUT'; end;
    if not isfinite(published) or published < '2020-01-01'::timestamptz or published > now()+interval '5 minutes' then raise exception 'INVALID_INPUT'; end if;
  end if;
  -- Mismas cuotas que documentos y preferencias, sin sondeo ni servicios nuevos.
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
  if p_action='seen' then
    if not exists(select 1 from public.plano_release_receipts where owner_id=p_owner)
      and (select count(*) from public.plano_release_receipts)>=10000 then raise exception 'GLOBAL_MONTH_LIMIT'; end if;
    insert into public.plano_release_receipts as saved(owner_id,release_id,published_at)
      values(p_owner,p_data->>'releaseId',published)
      on conflict(owner_id) do update set release_id=excluded.release_id,published_at=excluded.published_at,updated_at=now()
      where excluded.published_at >= saved.published_at;
  end if;
  select * into item from public.plano_release_receipts where owner_id=p_owner;
  if not found then return null; end if;
  return jsonb_build_object('releaseId',item.release_id,'publishedAt',item.published_at);
end $$;
revoke all on function public.plano_release_receipt(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.plano_release_receipt(text,text,jsonb) to service_role;
commit;
