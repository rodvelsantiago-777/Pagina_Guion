begin;
alter table public.plano_account_profiles add column if not exists avatar text not null default '';
do $avatar$
declare definition text;
begin
 if not exists(select 1 from pg_constraint where conrelid='public.plano_account_profiles'::regclass and conname='plano_avatar_bounded') then
  alter table public.plano_account_profiles add constraint plano_avatar_bounded check(avatar='' or (octet_length(avatar)<=11000 and avatar~'^data:image/(webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$'));
 end if;
 select pg_get_functiondef('public.plano_account(text,text,jsonb)'::regprocedure) into definition;
 if position('elsif p_action=''avatar''' in definition)=0 then
  definition=replace(definition,'''name'',profile.display_name,','''name'',profile.display_name,''avatar'',profile.avatar,');
  definition=replace(definition,'elsif p_action=''profile'' then',
   'elsif p_action=''avatar'' then'||chr(10)||
   '  candidate=p_data->>''avatar''; if candidate is null or octet_length(candidate)>11000 or (candidate<>'''' and candidate!~''^data:image/(webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$'') then raise exception ''INVALID_INPUT'';end if;'||chr(10)||
   '  update public.plano_account_profiles set avatar=candidate,updated_at=now() where owner_id=p_owner;return ''{}'';'||chr(10)||
   ' elsif p_action=''profile'' then');
  execute definition;
 end if;
end $avatar$;
commit;
