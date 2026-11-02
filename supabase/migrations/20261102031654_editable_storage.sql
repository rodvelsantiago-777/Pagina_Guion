begin;
alter table public.plano_projects add column if not exists storage_kind text not null default 'pdf' check (storage_kind in ('pdf','editable'));
alter table public.plano_projects add column if not exists pdf_cleanup_pending boolean not null default false;
do $migration$
declare definition text:=pg_get_functiondef('public.plano_cloud(text,text,uuid,jsonb)'::regprocedure); original text; replacement text;
begin
 if position('PLANO_EDITABLE_STORAGE' in definition)>0 then return; end if;
 original:='''list'',''read'',''download'',''reserve'',''ready'',''save''';
 if position(original in definition)=0 then raise exception 'Unexpected action list';end if;
 definition:=replace(definition,original,'''create_doc'',''convert_doc'',''cleanup_read'',''cleanup_done'',''list'',''read'',''download'',''reserve'',''ready'',''save''');
 definition:=replace(definition,'select id,name,project_name,fingerprint','select id,name,project_name,storage_kind,pdf_cleanup_pending,fingerprint');
 original:='  select * into item from public.plano_projects where id=p_id and owner_id=p_owner for update;';
 replacement:=$new$
  -- PLANO_EDITABLE_STORAGE: el texto se confirma antes de eliminar objetos de Storage.
  if p_action='create_doc' then
    if p_data->>'fingerprint' !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_data#>'{payload,screenplay}') is distinct from 'object'
      or p_data#>>'{payload,documentFormat}' is distinct from '2' or jsonb_typeof(p_data#>'{payload,annotations}') is distinct from 'array'
      or octet_length((p_data->'payload')::text)>350000 then raise exception 'INVALID_PAYLOAD';end if;
    select * into item from public.plano_projects where owner_id=p_owner and fingerprint=p_data->>'fingerprint';
    if found then return to_jsonb(item)||jsonb_build_object('created',false);end if;
    if (select count(*) from public.plano_projects where owner_id=p_owner)>=10 then raise exception 'USER_STORAGE_LIMIT';end if;
    if (select count(*) from public.plano_projects)>=80 then raise exception 'GLOBAL_STORAGE_LIMIT';end if;
    insert into public.plano_projects(owner_id,fingerprint,name,project_name,size_bytes,state,storage_kind,payload)
      values(p_owner,p_data->>'fingerprint',p_data->>'name',coalesce(nullif(left(btrim(regexp_replace(p_data->>'name','\.(pdf|plano)$','','i')),120),''),'Sin título'),octet_length((p_data->'payload')::text),'ready','editable',p_data->'payload') returning * into item;
    return to_jsonb(item)||jsonb_build_object('created',true);
  end if;
  select * into item from public.plano_projects where id=p_id and owner_id=p_owner for update;
  if p_action in ('cleanup_read','cleanup_done') then
    if not found then raise exception 'NOT_FOUND';end if;
    if item.state<>'ready' or item.storage_kind<>'editable' then raise exception 'NOT_READY';end if;
    if p_action='cleanup_done' then update public.plano_projects set pdf_cleanup_pending=false where id=p_id returning * into item;end if;
    return to_jsonb(item)-'payload';
  end if;
  if p_action='convert_doc' then
    if not found then raise exception 'NOT_FOUND';end if;
    if item.revision<>(p_data->>'revision')::integer or not(p_data ? 'revision') then raise exception 'CONFLICT';end if;
    if item.state<>'ready' then raise exception 'NOT_READY';end if;
    if item.storage_kind='editable' then return to_jsonb(item);end if;
    if jsonb_typeof(p_data#>'{payload,screenplay}') is distinct from 'object' or p_data#>>'{payload,documentFormat}' is distinct from '2'
      or p_data#>>'{payload,fingerprint}' is distinct from item.fingerprint or jsonb_typeof(p_data#>'{payload,annotations}') is distinct from 'array'
      or octet_length((p_data->'payload')::text)>350000 then raise exception 'INVALID_PAYLOAD';end if;
    -- La conversión no puede eliminar planos ni sus fichas por un fallo de cliente.
    if exists(select 1 from jsonb_array_elements(item.payload->'annotations') old_note where not exists(
      select 1 from jsonb_array_elements(p_data#>'{payload,annotations}') new_note
      where (new_note->>'id'=old_note->>'id' or new_note#>>'{coverageAnchor,key}'=old_note->>'id')
      and new_note @> (old_note-array['page','endPage','start','end','rects','text','scriptSelection','labelPosition','coverageAnchor','scriptAnchor','anchorReview']))) then raise exception 'INVALID_PAYLOAD';end if;
    if item.payload ? 'crew' and p_data#>'{payload,crew}' is distinct from item.payload->'crew' then raise exception 'INVALID_PAYLOAD';end if;
    if exists(select 1 from jsonb_array_elements(coalesce(item.payload->'corrections','[]')) old_mark
      where coalesce(old_mark->>'source','manual') not in ('spelling','syntax') and not exists(
        select 1 from jsonb_array_elements(coalesce(p_data#>'{payload,corrections}','[]')) new_mark where new_mark->>'id'=old_mark->>'id')) then raise exception 'INVALID_PAYLOAD';end if;
    update public.plano_projects set storage_kind='editable',pdf_cleanup_pending=true,payload=p_data->'payload',name=regexp_replace(name,'\.(pdf|plano)$','','i')||'.plano',size_bytes=octet_length((p_data->'payload')::text),revision=revision+1,updated_at=now() where id=p_id returning * into item;
    return to_jsonb(item);
  end if;$new$;
 if position(original in definition)=0 then raise exception 'Unexpected owner lookup';end if;
 definition:=replace(definition,original,replacement);
 original:='    if item.state<>''ready'' then raise exception ''NOT_READY''; end if;';
 replacement:='    if item.state<>''ready'' or (p_action=''download'' and item.storage_kind<>''pdf'') then raise exception ''NOT_READY''; end if;';
 if position(original in definition)=0 then raise exception 'Unexpected read validation';end if;
 definition:=replace(definition,original,replacement);
 original:='    if p_action=''save'' then';
 replacement:=$new$    if p_action='save' then
      if item.storage_kind='editable' and (p_data#>>'{payload,documentFormat}' is distinct from '2' or jsonb_typeof(p_data#>'{payload,screenplay}') is distinct from 'object') then raise exception 'CONFLICT';end if;$new$;
 if position(original in definition)=0 then raise exception 'Unexpected save';end if;
 definition:=replace(definition,original,replacement);
 original:='revision=revision+1,updated_at=now() where id=p_id returning * into item;';
 -- Mantiene size_bytes acorde al documento en los guardados, no a un PDF regenerable.
 definition:=replace(definition,'set payload=p_data->''payload'',revision=revision+1','set payload=p_data->''payload'',size_bytes=case when storage_kind=''editable'' then octet_length((p_data->''payload'')::text) else size_bytes end,revision=revision+1');
 execute definition;
end $migration$;
commit;
