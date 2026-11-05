-- Una sola llamada interna al entrar; los controles y límites siguen en sus funciones originales.
begin;
create or replace function public.plano_workspace_open(p_owner text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare opened jsonb; account_data jsonb;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_INPUT';end if;
 if coalesce((p_data->>'validSince')::bigint,0)>0 then
  perform public.plano_account(p_owner,'credential_epoch',p_data);
 end if;
 opened=public.plano_account(p_owner,'open',p_data);
 account_data=public.plano_account(p_owner,'read',p_data);
 return opened||jsonb_build_object('workspace',jsonb_build_object(
  'account_read',account_data,
  'list',public.plano_cloud(p_owner,'list',null,'{}'::jsonb),
  'preferences_read',jsonb_build_object('preferences',public.plano_preferences(p_owner,'read','{}'::jsonb)),
  'release_read',jsonb_build_object('receipt',public.plano_release_receipt(p_owner,'read','{}'::jsonb))
 ));
end $$;
revoke all on function public.plano_workspace_open(text,jsonb) from public,anon,authenticated;
grant execute on function public.plano_workspace_open(text,jsonb) to service_role;
commit;
