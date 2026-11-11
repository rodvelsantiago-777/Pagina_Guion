-- Proyecta solo el icono de la ficha en el listado privado, igual que la miniatura.
do $migration$
declare
  definition text := pg_get_functiondef('public.plano_cloud(text,text,uuid,jsonb)'::regprocedure);
  original text := 'end as thumbnail from public.plano_projects';
  replacement text := $projection$end as thumbnail,
        case when jsonb_typeof(payload#>'{projectInfo,emoji}') = 'string'
          and octet_length(payload#>>'{projectInfo,emoji}') <= 128
        then payload#>>'{projectInfo,emoji}' end as project_emoji from public.plano_projects$projection$;
begin
  if position(replacement in definition) > 0 then return; end if;
  if position(original in definition) = 0 then raise exception 'Unexpected plano_cloud library projection'; end if;
  execute replace(definition, original, replacement);
end $migration$;
