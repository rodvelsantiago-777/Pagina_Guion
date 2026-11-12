-- Añade el género de la ficha al listado privado, sin incluir el documento.
do $migration$
declare
  definition text := pg_get_functiondef('public.plano_cloud(text,text,uuid,jsonb)'::regprocedure);
  original text := 'end as project_emoji from public.plano_projects';
  replacement text := $projection$end as project_emoji,
        case when jsonb_typeof(payload#>'{projectInfo,genre}') = 'string'
          and char_length(payload#>>'{projectInfo,genre}') <= 120
        then payload#>>'{projectInfo,genre}' end as project_genre from public.plano_projects$projection$;
begin
  if position(replacement in definition) > 0 then return; end if;
  if position(original in definition) = 0 then raise exception 'Unexpected plano_cloud library projection'; end if;
  execute replace(definition, original, replacement);
end $migration$;
