/* Migración aislada: las carpetas no modifican el guion ni sus planos. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{PGlite}=require('./runtime-deps.cjs').load('@electric-sql/pglite');
(async()=>{const root=path.resolve(__dirname,'..'),db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(name=>name.endsWith('.sql')).sort(),folderName=migrations.find(name=>name.endsWith('_project_folders.sql'));
 for(const name of migrations.filter(name=>name<folderName))await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
 const rpc=async(owner,action,id,data)=>(await db.query('select public.plano_cloud($1,$2,$3,$4::jsonb) result',[owner,action,id,JSON.stringify(data||{})])).rows[0].result;
 const reserved=await rpc('folder-test','reserve',null,{fingerprint:'c'.repeat(64),name:'La historia.pdf',size_bytes:500});await rpc('folder-test','ready',reserved.id);
 const payload={version:1,annotations:[{id:'line',shotName:'P1'}],crew:{roles:[]},screenplay:{title:'La historia'}};
 let project=await rpc('folder-test','save',reserved.id,{revision:0,payload});
 const migration=process.env.PLANO_TEST_PROJECT_MIGRATION||path.join(root,'supabase/migrations',migrations.find(name=>name.endsWith('_project_folders.sql'))||'missing.sql'),sql=fs.readFileSync(migration,'utf8');await db.exec(sql);await db.exec(sql);
 for(const name of migrations.filter(name=>name>folderName))await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));await db.exec(sql);
 project=await rpc('folder-test','read',reserved.id);assert.equal(project.project_name,'La historia');assert.deepEqual(project.payload,payload);assert.equal(project.revision,1,'La conversión conserva las revisiones');
 const renamed=await rpc('folder-test','rename_project',project.id,{revision:project.revision,name:'  Rodaje de noviembre  '});assert.equal(renamed.project_name,'Rodaje de noviembre');assert.equal(renamed.name,'La historia.pdf');assert.equal(renamed.revision,2);assert.deepEqual((await rpc('folder-test','read',project.id)).payload,payload);
 await assert.rejects(rpc('another-owner','rename_project',project.id,{revision:2,name:'Otro'}),/NOT_FOUND/);
 await assert.rejects(rpc('folder-test','rename_project',project.id,{revision:1,name:'Obsoleto'}),/CONFLICT/);
 for(const name of ['', '  ',null,123, 'x'.repeat(121),'Texto\nmal'])await assert.rejects(rpc('folder-test','rename_project',project.id,{revision:2,name}),/INVALID_INPUT/);
 const file=await rpc('folder-test','rename',project.id,{revision:2,name:'Segunda versión.pdf'});assert.equal(file.project_name,'Rodaje de noviembre');assert.equal(file.name,'Segunda versión.pdf');
 assert.equal((await rpc('folder-test','list',null,{})).projects[0].project_name,'Rodaje de noviembre');assert.deepEqual((await rpc('another-owner','list',null,{})).projects,[]);
 const newProject=await rpc('folder-test','reserve',null,{fingerprint:'d'.repeat(64),name:'Nueva historia.pdf',size_bytes:500});assert.equal(newProject.project_name,'Nueva historia');
 await assert.rejects(rpc('folder-test','save',project.id,{revision:file.revision,payload:{version:1,annotations:[]}}),/CONFLICT/,'Se conserva la protección del redactor');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(rpc('folder-test','rename_project',project.id,{revision:3,name:'Intruso'}),/permission denied/);}finally{await db.exec('reset role');}}
 const meta=(await db.query("select prosecdef,proconfig,proacl::text from pg_proc where oid='public.plano_cloud(text,text,uuid,jsonb)'::regprocedure")).rows[0];assert.equal(meta.prosecdef,false);assert(meta.proconfig.some(v=>v.startsWith('search_path=')));assert(meta.proacl.includes('service_role'));
 console.log('OK carpetas: conversión sin pérdida, nombre independiente, validación, revisiones, aislamiento y permisos.');
 }finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
