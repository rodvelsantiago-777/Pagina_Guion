begin;
alter table public.plano_account_profiles add column if not exists session_required boolean not null default false;
update public.plano_account_profiles p set session_required=true where revoked_before>0 or exists(select 1 from public.plano_account_sessions s where s.owner_id=p.owner_id);
-- Una cuenta que ya registra dispositivos nunca vuelve al acceso sin prueba de sesión.
do $guard$
declare definition text;
begin
 select pg_get_functiondef('public.plano_account(text,text,jsonb)'::regprocedure) into definition;
 if position('not profile.session_required' in definition)=0 then
 definition=replace(definition,'if p_action=''open'' then','if p_action=''open'' then'||chr(10)||'  update public.plano_account_profiles set session_required=true where owner_id=p_owner and not session_required;');
 definition=replace(definition,'if p_action=''guard'' and profile.revoked_before=0 and coalesce','if p_action=''guard'' and not profile.session_required and profile.revoked_before=0 and coalesce');
 execute definition;
 end if;
end $guard$;
commit;
