/* PostgreSQL real aislado: una pestaña antigua no borra el texto del redactor. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{PGlite}=require('./runtime-deps.cjs').load('@electric-sql/pglite'),S=require('../screenplay.js');
(async()=>{const root=path.resolve(__dirname,'..'),db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(name=>name.endsWith('.sql')).sort(),writerName=migrations.find(name=>name.endsWith('_writer_payload_guard.sql'));
 for(const name of migrations.filter(name=>name<writerName))await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
 const migration=process.env.PLANO_TEST_WRITER_MIGRATION||path.join(root,'supabase/migrations',writerName||'missing.sql'),sql=fs.readFileSync(migration,'utf8');await db.exec(sql);await db.exec(sql);
 for(const name of migrations.filter(name=>name>writerName))await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));await db.exec(sql);
 const rpc=async(owner,action,id,data)=>(await db.query('select public.plano_cloud($1,$2,$3,$4::jsonb) result',[owner,action,id,JSON.stringify(data||{})])).rows[0].result;
 const reserved=await rpc('writer-test','reserve',null,{fingerprint:'a'.repeat(64),name:'Prueba.pdf',size_bytes:500}),ready=await rpc('writer-test','ready',reserved.id);
 const payload={version:1,fingerprint:ready.fingerprint,annotations:[],screenplay:S.create('Un guion protegido',{name:'Ana',email:'ana@example.invalid'})};let project=await rpc('writer-test','save',ready.id,{revision:ready.revision,payload});
 await assert.rejects(rpc('writer-test','save',ready.id,{revision:project.revision,payload:{version:1,fingerprint:ready.fingerprint,annotations:[]}}),/CONFLICT/);
 await assert.rejects(rpc('writer-test','save',ready.id,{revision:project.revision,payload:{...payload,screenplay:null}}),/CONFLICT/);assert.deepEqual((await rpc('writer-test','read',ready.id)).payload,payload);
 await assert.rejects(rpc('someone-else','read',ready.id),/NOT_FOUND/);payload.screenplay.title='Nueva versión';project=await rpc('writer-test','save',ready.id,{revision:project.revision,payload});assert.equal((await rpc('writer-test','read',ready.id)).payload.screenplay.title,'Nueva versión');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(rpc('writer-test','read',ready.id),/permission denied/);}finally{await db.exec('reset role');}}
 const metadata=(await db.query("select prosecdef,proconfig,proacl::text from pg_proc where oid='public.plano_cloud(text,text,uuid,jsonb)'::regprocedure")).rows[0];assert.equal(metadata.prosecdef,false);assert(metadata.proconfig.some(value=>value.startsWith('search_path=')));assert(metadata.proacl.includes('service_role'));
 // Un PDF anterior sigue admitiendo el mismo formato de guardado.
 const old=await rpc('writer-test','reserve',null,{fingerprint:'b'.repeat(64),name:'Anterior.pdf',size_bytes:500});await rpc('writer-test','ready',old.id);await rpc('writer-test','save',old.id,{revision:0,payload:{version:1,annotations:[]}});
 console.log('OK: migración idempotente, cliente antiguo/null rechazados sin pérdida de texto, guardado nativo permitido, PDF antiguo compatible y ACL/propiedad/search_path conservados.');
 }finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
