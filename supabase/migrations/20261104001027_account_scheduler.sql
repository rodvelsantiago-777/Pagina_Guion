-- El servidor ejecuta la limpieza y reintenta correos sin depender de un navegador abierto.
-- PGlite no incluye estas extensiones: las reglas de cuenta se prueban allí por separado.
do $install$
begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') and exists(select 1 from pg_available_extensions where name='pg_net') then
  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net with schema extensions';
  execute $setup$
   do $secret$ begin
    if not exists(select 1 from vault.secrets where name='plano_account_maintenance') then
     perform vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'plano_account_maintenance','Autenticación interna del mantenimiento de cuentas PLANO');
    end if;
   end $secret$;
   grant usage on schema vault to service_role;
   grant select on vault.decrypted_secrets to service_role;
   create or replace function public.plano_maintenance_token() returns text language sql security invoker set search_path='' as $fn$
    select decrypted_secret from vault.decrypted_secrets where name='plano_account_maintenance' limit 1
   $fn$;
   revoke all on function public.plano_maintenance_token() from public,anon,authenticated;
   grant execute on function public.plano_maintenance_token() to service_role;
   select cron.schedule('plano-account-maintenance','7 * * * *',$job$
    select net.http_post(url:='https://hoymkaxarjkgttkgocrn.supabase.co/functions/v1/plano-cloud?action=account_maintenance',
     headers:=jsonb_build_object('Content-Type','application/json','x-plano-maintenance',(select decrypted_secret from vault.decrypted_secrets where name='plano_account_maintenance')),
     body:='{}'::jsonb,timeout_milliseconds:=60000);
   $job$);
  $setup$;
 end if;
end $install$;
