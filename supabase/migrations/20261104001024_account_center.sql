-- Perfil privado y sesiones Firebase verificadas por la función HTTPS. No habilita acceso de cliente a tablas.
begin;
create table if not exists public.plano_account_profiles (
 owner_id text primary key, display_name text not null default '', birth_date date, company text not null default '',
 status text not null default 'active' check(status in ('active','suspended','purging')),
 revoked_before bigint not null default 0, suspended_at timestamptz, purge_after timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.plano_account_sessions (
 id uuid primary key default gen_random_uuid(), owner_id text not null references public.plano_account_profiles(owner_id) on delete cascade,
 secret_hash text not null check(secret_hash ~ '^[a-f0-9]{64}$'), auth_time bigint not null,
 device text not null, started_at timestamptz not null, last_seen timestamptz not null default now(), revoked_at timestamptz,
 unique(owner_id,secret_hash)
);
create index if not exists plano_account_sessions_owner on public.plano_account_sessions(owner_id,last_seen desc);
create table if not exists public.plano_account_mail (
 id uuid primary key default gen_random_uuid(), owner_id text not null, event_key text not null unique,
 recipient text not null, kind text not null check(kind='password_changed'), created_at timestamptz not null default now(),
 sent_at timestamptz, attempts integer not null default 0, next_attempt timestamptz not null default now()
);
create table if not exists public.plano_account_tombstones (
 owner_hash text primary key check(owner_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz not null
);
alter table public.plano_account_profiles enable row level security;
alter table public.plano_account_sessions enable row level security;
alter table public.plano_account_mail enable row level security;
alter table public.plano_account_tombstones enable row level security;
revoke all on public.plano_account_profiles,public.plano_account_sessions,public.plano_account_mail,public.plano_account_tombstones from public,anon,authenticated;
grant all on public.plano_account_profiles,public.plano_account_sessions,public.plano_account_mail,public.plano_account_tombstones to service_role;
create or replace function public.plano_account(p_owner text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare profile public.plano_account_profiles; session public.plano_account_sessions; stamp bigint; result jsonb; candidate text;
begin
 -- Se llama únicamente desde service_role, después de verificar firma, issuer y email_verified de Firebase.
 if p_action='due' then
  return coalesce((select jsonb_agg(owner_id) from (select owner_id from public.plano_account_profiles where status in ('suspended','purging') and purge_after<=now() order by purge_after limit 10) t),'[]');
 end if;
 if p_action='mail_due' then
  with due as (select id from public.plano_account_mail where sent_at is null and next_attempt<=now() order by created_at limit 10 for update skip locked), claimed as (update public.plano_account_mail m set next_attempt=now()+interval '10 minutes' from due where m.id=due.id returning m.id,m.recipient,m.created_at) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;return result;
 end if;
 if p_action='mail_done' then
  update public.plano_account_mail set sent_at=now() where id=(p_data->>'id')::uuid; return '{}';
 end if;
 if p_action='mail_retry' then
  update public.plano_account_mail set attempts=attempts+1,next_attempt=now()+interval '1 hour' where id=(p_data->>'id')::uuid;return '{}';
 end if;
 if p_action='prune' then
  delete from public.plano_account_tombstones where expires_at<now();
  delete from public.plano_account_mail where sent_at<now()-interval '7 days';
  delete from public.plano_account_sessions where revoked_at<now()-interval '30 days';return '{}';
 end if;
 if p_owner is null or p_owner!~'^[A-Za-z0-9_-]{1,128}$' then raise exception 'UNAUTHORIZED';end if;
 perform pg_advisory_xact_lock(hashtextextended('plano-account:'||p_owner,0));
 if exists(select 1 from public.plano_account_tombstones where owner_hash=p_data->>'ownerHash' and expires_at>now()) then raise exception 'ACCOUNT_DELETED';end if;
 select * into profile from public.plano_account_profiles where owner_id=p_owner for update;
 if p_action='guard' and profile.owner_id is null then return '{}';end if; -- Clientes anteriores, sin gestión de sesiones todavía.
 if p_action='open' and profile.owner_id is null then
  insert into public.plano_account_profiles(owner_id,display_name) values(p_owner,left(coalesce(p_data->>'name',''),120)) returning * into profile;
 end if;
 if profile.owner_id is null then raise exception 'SESSION_REVOKED';end if;
 if p_action='purge_claim' then
  if profile.status not in ('suspended','purging') or profile.purge_after>now() then return 'null';end if;
  update public.plano_account_profiles set status='purging' where owner_id=p_owner;
  return jsonb_build_object('owner',p_owner,'files',coalesce((select jsonb_agg(id) from public.plano_projects where owner_id=p_owner and (storage_kind<>'editable' or pdf_cleanup_pending)),'[]'));
 end if;
 if p_action='purge_finish' then
  if profile.status<>'purging' or profile.purge_after>now() then raise exception 'INVALID_INPUT';end if;
  if coalesce(p_data->>'ownerHash','')!~'^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
  insert into public.plano_account_tombstones values(p_data->>'ownerHash',now()+interval '2 hours') on conflict(owner_hash) do update set expires_at=excluded.expires_at;
  delete from public.plano_projects where owner_id=p_owner;
  delete from public.plano_preferences where owner_id=p_owner;
  delete from public.plano_release_receipts where owner_id=p_owner;
  delete from public.plano_usage where owner_id=p_owner;
  delete from public.plano_account_mail where owner_id=p_owner;
  delete from public.plano_account_profiles where owner_id=p_owner;return '{}';
 end if;
 stamp=coalesce((p_data->>'authTime')::bigint,0);
 if profile.status='purging' or profile.status='suspended' and profile.purge_after<=now() then raise exception 'ACCOUNT_DELETED';end if;
 if p_action='open' then
  if stamp<=profile.revoked_before or exists(select 1 from public.plano_account_sessions where owner_id=p_owner and auth_time=stamp and revoked_at is not null) then raise exception 'SESSION_REVOKED';end if;
  if stamp<floor(extract(epoch from now()))-2592000 then raise exception 'RECENT_LOGIN';end if;
  if coalesce(p_data->>'secretHash','')!~'^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
  if profile.status='suspended' then
   update public.plano_account_profiles set status='active',suspended_at=null,purge_after=null,updated_at=now() where owner_id=p_owner;
  end if;
  select * into session from public.plano_account_sessions where owner_id=p_owner and secret_hash=p_data->>'secretHash';
  if session.revoked_at is not null and stamp<=session.auth_time then raise exception 'SESSION_REVOKED';end if;
  if session.id is null and (select count(*) from public.plano_account_sessions where owner_id=p_owner and revoked_at is null)>49 then raise exception 'SESSION_LIMIT';end if;
  insert into public.plano_account_sessions(owner_id,secret_hash,auth_time,device,started_at)
   values(p_owner,p_data->>'secretHash',stamp,left(coalesce(p_data->>'device','Navegador'),160),to_timestamp(stamp))
   on conflict(owner_id,secret_hash) do update set last_seen=now(),revoked_at=null,auth_time=greatest(public.plano_account_sessions.auth_time,excluded.auth_time)
   returning * into session;
  return jsonb_build_object('sessionId',session.id,'name',profile.display_name,'restored',profile.status='suspended');
 end if;
 if profile.status<>'active' or stamp<=profile.revoked_before then raise exception 'SESSION_REVOKED';end if;
 if p_action='guard' and profile.revoked_before=0 and coalesce(p_data->>'secretHash','')='' then return '{}';end if; -- El despliegue conserva los clientes anteriores hasta un cierre global.
 select * into session from public.plano_account_sessions where owner_id=p_owner and secret_hash=p_data->>'secretHash' and revoked_at is null;
 if session.id is null or session.last_seen<now()-interval '30 days' then raise exception 'SESSION_REVOKED';end if;
 if session.last_seen<now()-interval '5 minutes' then update public.plano_account_sessions set last_seen=now() where id=session.id;end if;
 if p_action='guard' then return '{}';end if;
 if p_action='read' then
  return jsonb_build_object('profile',jsonb_build_object('name',profile.display_name,'birthDate',profile.birth_date,'company',profile.company,'createdAt',profile.created_at),
   'sessionId',session.id,'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'device',device,'startedAt',started_at,'lastSeen',last_seen) order by last_seen desc) from public.plano_account_sessions where owner_id=p_owner and revoked_at is null and last_seen>now()-interval '30 days'),'[]'));
 elsif p_action='profile' then
  candidate=trim(p_data->>'name');
  if candidate is null or length(candidate)<2 or length(candidate)>120 or length(coalesce(p_data->>'company',''))>120 or candidate~'[[:cntrl:]]' then raise exception 'INVALID_INPUT';end if;
  if nullif(p_data->>'birthDate','')::date>current_date or nullif(p_data->>'birthDate','')::date<current_date-interval '120 years' then raise exception 'INVALID_INPUT';end if;
  update public.plano_account_profiles set display_name=candidate,company=trim(coalesce(p_data->>'company','')),birth_date=nullif(p_data->>'birthDate','')::date,updated_at=now() where owner_id=p_owner;return '{}';
 elsif p_action='revoke' then
  update public.plano_account_sessions set revoked_at=now() where owner_id=p_owner and id=(p_data->>'sessionId')::uuid and revoked_at is null;
  if not found then raise exception 'NOT_FOUND';end if;return '{}';
 elsif p_action in ('revoke_all','password_changed','suspend') then
  if stamp<floor(extract(epoch from now()))-300 then raise exception 'RECENT_LOGIN';end if;
  update public.plano_account_sessions set revoked_at=now() where owner_id=p_owner and revoked_at is null;
  update public.plano_account_profiles set revoked_before=floor(extract(epoch from now())),
   status=case when p_action='suspend' then 'suspended' else 'active' end,
   suspended_at=case when p_action='suspend' then now() else null end,
   purge_after=case when p_action='suspend' then now()+interval '30 days' else null end,updated_at=now() where owner_id=p_owner;
  if p_action='password_changed' then
   if coalesce(p_data->>'email','')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INPUT';end if;
   insert into public.plano_account_mail(owner_id,event_key,recipient,kind) values(p_owner,p_owner||':'||(p_data->>'eventKey'),p_data->>'email','password_changed') on conflict(event_key) do nothing;
  end if;
  return jsonb_build_object('purgeAfter',case when p_action='suspend' then now()+interval '30 days' else null end);
 end if;
 raise exception 'INVALID_INPUT';
end;$$;
revoke all on function public.plano_account(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.plano_account(text,text,jsonb) to service_role;
commit;
