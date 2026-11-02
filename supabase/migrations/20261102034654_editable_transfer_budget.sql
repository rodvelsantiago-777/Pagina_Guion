-- El JSON del guion sale de la base de datos y después de la función.
-- Reserva ambos tramos en el límite gratuito existente, sin cambiarlo ni contratar capacidad.
do $migration$
declare definition text:=pg_get_functiondef('public.plano_cloud(text,text,uuid,jsonb)'::regprocedure);
 original text:='  if p_action in (''read'',''reserve'',''ready'') then reserve_bytes:=450000; end if;';
 replacement text:=$budget$  if p_action in ('read','reserve','ready') then reserve_bytes:=450000; end if;
  -- PLANO_EDITABLE_TRANSFER_BUDGET
  if p_action in ('read','create_doc','convert_doc') then reserve_bytes:=900000;end if;
  if p_action in ('cleanup_read','cleanup_done') then reserve_bytes:=8192;end if;$budget$;
begin
 if position('PLANO_EDITABLE_TRANSFER_BUDGET' in definition)>0 then return;end if;
 if position(original in definition)=0 then raise exception 'Unexpected transfer reservation';end if;
 execute replace(definition,original,replacement);
end $migration$;
