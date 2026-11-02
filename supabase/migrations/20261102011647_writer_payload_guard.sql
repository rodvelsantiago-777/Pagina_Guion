-- Impide que una versión anterior del cliente elimine un guion editable que no entiende.
-- No modifica proyectos, límites, propiedad, RLS ni permisos de ejecución.
do $migration$
declare
  definition text := pg_get_functiondef('public.plano_cloud(text,text,uuid,jsonb)'::regprocedure);
  original text := '      update public.plano_projects set payload=p_data->''payload'',revision=revision+1,updated_at=now() where id=p_id returning * into item;';
  guarded text := $guard$
      -- PLANO_WRITER_PAYLOAD_GUARD
      if item.payload ? 'screenplay' and jsonb_typeof(p_data#>'{payload,screenplay}') is distinct from 'object' then
        raise exception 'CONFLICT';
      end if;
      update public.plano_projects set payload=p_data->'payload',revision=revision+1,updated_at=now() where id=p_id returning * into item;$guard$;
begin
  if position('PLANO_WRITER_PAYLOAD_GUARD' in definition)>0 then return; end if;
  if position(original in definition)=0 then raise exception 'Unexpected plano_cloud save definition'; end if;
  execute replace(definition,original,guarded);
end $migration$;
