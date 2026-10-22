-- La biblioteca recibe miniaturas pequeñas sin descargar los PDF ni las notas.
-- Conserva la autorización por propietario, el ACL del RPC y todos sus límites.
do $migration$
declare
  definition text := pg_get_functiondef('public.plano_cloud(text,text,uuid,jsonb)'::regprocedure);
  old_columns text := 'id,name,fingerprint,size_bytes,state,revision,created_at,updated_at from public.plano_projects';
  new_columns text := $columns$id,name,fingerprint,size_bytes,state,revision,created_at,updated_at,
        case when length(payload->>'thumbnail') <= 20000
          and payload->>'thumbnail' ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
        then payload->>'thumbnail' end as thumbnail from public.plano_projects$columns$;
begin
  if position(new_columns in definition)>0 then return; end if;
  if position(old_columns in definition)=0 then raise exception 'Unexpected plano_cloud definition'; end if;
  definition := replace(definition,old_columns,new_columns);
  definition := replace(definition,'reserve_bytes:=65536','reserve_bytes:=262144');
  execute definition;
end $migration$;
