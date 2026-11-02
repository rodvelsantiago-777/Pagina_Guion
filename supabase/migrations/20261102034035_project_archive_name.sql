-- Un archivo .plano conserva el nombre de carpeta, independiente del nombre del guion.
do $migration$
declare definition text:=pg_get_functiondef('public.plano_cloud(text,text,uuid,jsonb)'::regprocedure);
 original text:=$old$values(p_owner,p_data->>'fingerprint',p_data->>'name',coalesce(nullif(left(btrim(regexp_replace(p_data->>'name','\.(pdf|plano)$','','i')),120),''),'Sin título'),octet_length((p_data->'payload')::text),'ready','editable',p_data->'payload')$old$;
 replacement text:=$new$values(p_owner,p_data->>'fingerprint',p_data->>'name',coalesce(nullif(btrim(p_data->>'project_name'),''),nullif(left(btrim(regexp_replace(p_data->>'name','\.(pdf|plano)$','','i')),120),''),'Sin título'),octet_length((p_data->'payload')::text),'ready','editable',p_data->'payload')$new$;
begin
 if position('PLANO_PROJECT_ARCHIVE_NAME' in definition)>0 then return;end if;
 if position(original in definition)=0 then raise exception 'Unexpected editable project insert';end if;
 definition:=replace(definition,original,replacement);
 definition:=replace(definition,'  if p_action=''create_doc'' then',$guard$  if p_action='create_doc' then
    -- PLANO_PROJECT_ARCHIVE_NAME
    if p_data ? 'project_name' and p_data->'project_name'<>'null'::jsonb and (jsonb_typeof(p_data->'project_name')<>'string' or length(btrim(p_data->>'project_name')) not between 1 and 120 or p_data->>'project_name' ~ '[[:cntrl:]]') then raise exception 'INVALID_INPUT';end if;$guard$);
 execute definition;
end $migration$;
