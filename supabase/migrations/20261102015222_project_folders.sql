-- Nombre de carpeta independiente del archivo. Conserva PDF, notas, autoría y permisos.
begin;
alter table public.plano_projects add column if not exists project_name text
  check (length(btrim(project_name)) between 1 and 120 and project_name !~ '[[:cntrl:]]');
update public.plano_projects
  set project_name=coalesce(nullif(left(btrim(regexp_replace(name,'\.pdf$','','i')),120),''),'Sin título')
  where project_name is null;
do $migration$
declare
  definition text := pg_get_functiondef('public.plano_cloud(text,text,uuid,jsonb)'::regprocedure);
  original text;
  replacement text;
begin
  if position('PLANO_PROJECT_FOLDERS' in definition)>0 then return; end if;
  original := '''save'',''rename'',''delete_begin''';
  if position(original in definition)=0 then raise exception 'Unexpected action definition'; end if;
  definition := replace(definition,original,'''save'',''rename'',''rename_project'',''delete_begin''');
  definition := replace(definition,'''save'',''rename'')','''save'',''rename'',''rename_project'')');
  original := 'select id,name,fingerprint,size_bytes';
  if position(original in definition)=0 then raise exception 'Unexpected list definition'; end if;
  definition := replace(definition,original,'select id,name,project_name,fingerprint,size_bytes');
  original := $old$insert into public.plano_projects(owner_id,fingerprint,name,size_bytes)
      values(p_owner,p_data->>'fingerprint',p_data->>'name',(p_data->>'size_bytes')::integer)$old$;
  replacement := $new$insert into public.plano_projects(owner_id,fingerprint,name,project_name,size_bytes)
      values(p_owner,p_data->>'fingerprint',p_data->>'name',coalesce(nullif(left(btrim(regexp_replace(p_data->>'name','\.pdf$','','i')),120),''),'Sin título'),(p_data->>'size_bytes')::integer)$new$;
  if position(original in definition)=0 then raise exception 'Unexpected reserve definition'; end if;
  definition := replace(definition,original,replacement);
  original := '    elsif p_action=''rename'' then';
  replacement := $new$    elsif p_action='rename_project' then
      -- PLANO_PROJECT_FOLDERS
      if jsonb_typeof(p_data->'name') is distinct from 'string'
        or length(btrim(p_data->>'name')) not between 1 and 120
        or p_data->>'name' ~ '[[:cntrl:]]' then raise exception 'INVALID_INPUT'; end if;
      update public.plano_projects set project_name=btrim(p_data->>'name'),revision=revision+1,updated_at=now() where id=p_id returning * into item;
    elsif p_action='rename' then$new$;
  if position(original in definition)=0 then raise exception 'Unexpected rename definition'; end if;
  definition := replace(definition,original,replacement);
  execute definition;
end $migration$;
commit;
