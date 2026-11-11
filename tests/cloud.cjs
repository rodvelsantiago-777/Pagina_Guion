/* SQL real en PostgreSQL WASM, firma JWT real y navegador. Storage se simula en memoria.
 * No toca el proyecto Supabase del usuario, no crea cuentas y no envía correos. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {PGlite}=require('./runtime-deps.cjs').load('@electric-sql/pglite');
const load=name=>require(path.join(process.env.PLANO_RUNTIME_MODULES,name));
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const root=path.resolve(__dirname,'..'),base='https://rodvelsantiago-777.github.io/Pagina_Guion/',endpoint='https://hoymkaxarjkgttkgocrn.supabase.co/functions/v1/plano-cloud';
(async()=>{
 const jose=await require('./runtime-deps.cjs').import('jose');
 const {firebaseVerifier}=await import('../supabase/functions/plano-cloud/auth.mjs'),{createHandler}=await import('../supabase/functions/plano-cloud/handler.mjs');
 const db=new PGlite(),files=new Map(),keys=await jose.generateKeyPair('RS256'),jwtKeys=jose.createLocalJWKSet({keys:[await jose.exportJWK(keys.publicKey)]});
 const sign=async(uid,options={})=>new jose.SignJWT({email_verified:true,auth_time:Math.floor(Date.now()/1000),...options.claims}).setProtectedHeader({alg:'RS256'}).setSubject(uid).setIssuedAt().setExpirationTime(options.exp||'1h').setIssuer('https://securetoken.google.com/'+(options.project||'planos-15624')).setAudience(options.project||'planos-15624').sign(keys.privateKey);
 const tokens={ana:await sign('ana'),bob:await sign('bob')},verify=firebaseVerifier(jose,'planos-15624',jwtKeys);
 let failUpload=false,failRemove=false,failFinish=false,uploads=0;
 const rpc=async(owner,action,id,data)=>{if(failFinish&&action==='delete_finish')throw new Error('UNAVAILABLE');return(await db.query('select public.plano_cloud($1,$2,$3,$4::jsonb) as result',[owner,action,id,JSON.stringify(data)])).rows[0].result;};
 const preferences=async(owner,action,patch)=>(await db.query('select public.plano_preferences($1,$2,$3::jsonb) as result',[owner,action,JSON.stringify(patch)])).rows[0].result;
 const handler=createHandler({verify,rpc,preferences,origins:[new URL(base).origin],
  upload:async(owner,id,data)=>{if(failUpload)throw new Error('Storage unavailable');files.set(owner+'/'+id,new Uint8Array(data));uploads++;},
  download:async(owner,id)=>{const bytes=files.get(owner+'/'+id);if(!bytes)throw new Error('UNAVAILABLE');return new Blob([bytes],{type:'application/pdf'});},
  remove:async(owner,id)=>{if(failRemove)throw new Error('Storage unavailable');files.delete(owner+'/'+id);}
 });
 const send=async(action,data={},token=tokens.ana)=>handler(new Request(endpoint+'?action='+action,{method:'POST',headers:{Origin:new URL(base).origin,Authorization:'Bearer '+token,...(!(data instanceof FormData)?{'Content-Type':'application/json'}:{})},body:data instanceof FormData?data:JSON.stringify(data)}));
 const json=async(action,data={},token=tokens.ana)=>{const response=await send(action,data,token);return{status:response.status,...await response.json()};};
 // Prepara registros de la versión anterior; la ruta HTTP de subida de PDF está retirada.
 const create=async(bytes,name='Guion de prueba.pdf',token=tokens.ana)=>{const owner=await verify(token),fingerprint=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');let project=await rpc(owner,'reserve',null,{fingerprint,name,size_bytes:bytes.length});if(project.created){files.set(owner+'/'+project.id,new Uint8Array(bytes));uploads++;project=await rpc(owner,'ready',project.id,{});}return{status:200,project};};
 let browser;
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261021001829_plano_private_cloud.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  const prefsMigration=fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>name.endsWith('_account_preferences.sql'));await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',prefsMigration),'utf8'));
  const libraryMigration=fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>name.endsWith('_library_previews.sql'));await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',libraryMigration),'utf8'));await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',libraryMigration),'utf8'));
  const writerMigration=fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>name.endsWith('_writer_payload_guard.sql'));await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',writerMigration),'utf8'));
  const folderMigration=process.env.PLANO_TEST_PROJECT_MIGRATION||path.join(root,'supabase/migrations',fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>name.endsWith('_project_folders.sql'))||'missing.sql');await db.exec(fs.readFileSync(folderMigration,'utf8'));
  const editableMigration=process.env.PLANO_TEST_EDITABLE_MIGRATION||path.join(root,'supabase/migrations',fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_editable_storage.sql'))||'missing.sql');await db.exec(fs.readFileSync(editableMigration,'utf8'));
  const emojiMigration=fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>name.endsWith('_project_emoji.sql'));
  const emojiSql=fs.readFileSync(path.join(root,'supabase/migrations',emojiMigration),'utf8');await db.exec(emojiSql);await db.exec(emojiSql);
  await db.exec('set role service_role');try{assert.equal(await preferences('ana','read',{}),null);}finally{await db.exec('reset role');}
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(db.query('select * from public.plano_preferences'),/permission denied/);await assert.rejects(db.query("select public.plano_preferences('ana','read')"),/permission denied/);}finally{await db.exec('reset role');}}
  assert.equal((await json('preferences_read',{},'')).status,401);
  assert.equal((await json('preferences_save',{patch:{mode:'dark',preset:'violet'},owner:'bob'})).status,200);
  assert.equal((await json('preferences_read',{},tokens.bob)).preferences,null,'El propietario del cuerpo no cambia la cuenta del token');
  assert.deepEqual((await json('preferences_save',{patch:{preset:'blue'}})).preferences,{mode:'dark',preset:'blue'});
  assert.deepEqual((await json('preferences_save',{patch:{mode:'light'}})).preferences,{mode:'light',preset:'blue'});
  for(const patch of [{},{mode:'auto'},{preset:'custom'},{mode:null},{owner:'bob'},[]]){assert.equal((await json('preferences_save',{patch})).status,400);await assert.rejects(preferences('ana','save',patch),/INVALID_INPUT/);}
  await db.exec('truncate public.plano_preferences,public.plano_usage');
  await db.exec('set role service_role');try{assert.deepEqual((await rpc('ana','list',null,{})).projects,[],'El servidor ejecuta la función con sus permisos, sin SECURITY DEFINER');}finally{await db.exec('reset role');}
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);try{await assert.rejects(db.query('select * from public.plano_projects'),/permission denied/);await assert.rejects(db.query("select public.plano_cloud('ana','list')"),/permission denied/);}finally{await db.exec('reset role');}
  }
  assert.equal((await json('list',{},'')).status,401);
  assert.equal((await json('list',{},await sign('ana',{project:'other-project'}))).status,401);
  assert.equal((await json('list',{},await sign('ana',{claims:{email_verified:false}}))).status,401);
  assert.equal((await json('list',{},await sign('ana',{exp:'-1h'}))).status,401);
  assert.equal((await json('list',{},tokens.ana.slice(0,-8)+'tampered')).status,401);
  const denied=await handler(new Request(endpoint+'?action=list',{method:'POST',headers:{origin:'https://untrusted.invalid',authorization:'Bearer '+tokens.ana},body:'{}'}));assert.equal(denied.status,403);
  const initial=await create(Buffer.from('%PDF-1.7\nfixture'));assert.equal(initial.status,200);const project=initial.project;
  assert.equal(project.project_name,'Guion de prueba');
  for(const name of ['', ' ', null, 'x'.repeat(121), 'Título\nincorrecto'])assert.equal((await json('rename_project',{id:project.id,revision:0,name})).status,400);
  assert.equal((await json('rename_project',{id:project.id,revision:0,name:'Carpeta ajena'},tokens.bob)).status,404);
  assert.equal((await json('read',{id:project.id},tokens.bob)).status,404);
  assert.equal((await json('download',{id:project.id},tokens.bob)).status,404);
  assert.equal((await json('delete',{id:project.id,revision:0},tokens.bob)).status,404);
  assert.equal((await json('save',{id:project.id,revision:0,payload:{version:1,annotations:[]}},tokens.bob)).status,404);
  assert.equal((await create(Buffer.from('%PDF-1.7\nfixture'))).project.id,project.id);assert.equal(uploads,1);
  const payload={version:1,annotations:[{id:'note',type:'line',shotName:'Plano A'}]};
  const concurrent=await Promise.all([json('save',{id:project.id,revision:0,payload}),json('save',{id:project.id,revision:0,payload:{version:1,annotations:[]}})]);
  assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
  failRemove=true;assert.equal((await json('delete',{id:project.id,revision:1})).status,503);failRemove=false;
  assert.equal((await json('read',{id:project.id})).project.state,'ready');
  failFinish=true;assert.equal((await json('delete',{id:project.id,revision:1})).status,503);failFinish=false;
  assert.equal((await json('delete',{id:project.id,revision:1})).status,200,'Se recupera un borrado interrumpido después de eliminar el objeto');
  assert.equal((await json('create',{})).code,'UPGRADE_REQUIRED','La API no admite nuevos PDF binarios');
  await db.exec('truncate public.plano_projects,public.plano_usage');files.clear();uploads=0;
  // Límites aplicados por SQL, independientes de los controles del navegador.
  for(let i=0;i<10;i++)await rpc('ana','reserve',null,{name:'Limite.pdf',fingerprint:i.toString(16).padStart(64,'0'),size_bytes:8});
  await assert.rejects(rpc('ana','reserve',null,{name:'Otro.pdf',fingerprint:'f'.repeat(64),size_bytes:8}),/USER_STORAGE_LIMIT/);
  await db.exec('truncate public.plano_projects,public.plano_usage');
  for(let i=0;i<80;i++)await rpc('owner'+i,'reserve',null,{name:'Limite.pdf',fingerprint:i.toString(16).padStart(64,'0'),size_bytes:8});
  await assert.rejects(rpc('new-owner','reserve',null,{name:'Otro.pdf',fingerprint:'f'.repeat(64),size_bytes:8}),/GLOBAL_STORAGE_LIMIT/);
  await db.exec("update public.plano_usage set transfer_bytes=3000000000 where owner_id='*'");
  await assert.rejects(rpc('ana','list',null,{}),/GLOBAL_MONTH_LIMIT/);
  await db.exec('truncate public.plano_projects,public.plano_usage');
  console.log('OK servidor: firmas JWT, verificación de correo, RLS, separación de cuentas, revisiones, cuotas, deduplicación y recuperación de subidas/borrados interrumpidos.');

  browser=await chromium.launch(process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
  const errors=[];
  async function projectHome(page){await require('./header-menu.cjs').open(page);await page.locator('#menu-home').click();}
  async function newDevice(owner='ana',options={}){
   const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();await page.addInitScript(()=>globalThis.PlanoTestDisableSpelling=true);
   page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
   if(options.initialSettings)await page.addInitScript(settings=>localStorage.setItem('plano-appearance-v2',JSON.stringify(settings)),options.initialSettings);
   await page.route(base+'**',route=>{
    const relative=decodeURIComponent(new URL(route.request().url()).pathname.slice(new URL(base).pathname.length))||'index.html';
    if(relative==='accounts.js')return route.fulfill({contentType:'text/javascript',body:`globalThis.PlanoAccounts={ready:Promise.resolve(),getUser:()=>({id:${JSON.stringify(owner)},email:'prueba@example.invalid'}),getAccessToken:async()=>${JSON.stringify(tokens[owner])},notesKey:f=>'plano-notes-user-v1:${owner}:'+f,connectWorkspace:hooks=>{globalThis.cloudTestHooks=hooks;hooks.change(${JSON.stringify(owner)});},open:()=>{}};document.body.classList.remove('auth-locked');document.querySelector('#auth-entry').hidden=true;document.querySelector('.app-shell').inert=false;document.querySelector('.app-shell').setAttribute('aria-hidden','false');`});
    const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   await page.route(endpoint+'**',async route=>{
    const request=route.request();const response=await handler(new Request(request.url(),{method:request.method(),headers:request.headers(),body:request.postDataBuffer()||undefined}));
    if(request.url().includes('action=preferences_read')&&options.holdRead)await options.holdRead;
    if(request.url().includes('action=list')){options.onList?.();if(options.holdList)await options.holdList;}
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
   });
   await page.goto(base);await page.waitForFunction(()=>globalThis.PlanoCloudLibrary&&PlanoCloud.info().owner);
   return{page,context};
  }
  // Dos dispositivos recuperan tema y modo sin tener que subir un PDF.
  const legacy=await newDevice('ana',{initialSettings:{mode:'dark',preset:'red'}});await legacy.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'dark',preset:'red'},'La primera cuenta adopta la personalización anterior si aún no tiene una en la nube');await legacy.context.close();await db.exec('truncate public.plano_preferences,public.plano_usage');
  const appearanceOne=await newDevice();await appearanceOne.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  await require('./header-menu.cjs').open(appearanceOne.page);await appearanceOne.page.locator('#toggle-theme').click();await require('./header-menu.cjs').open(appearanceOne.page);await appearanceOne.page.locator('#open-appearance').click();await appearanceOne.page.locator('[data-appearance-preset=violet]').click();
  await appearanceOne.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'dark',preset:'violet'});
  const appearanceTwo=await newDevice();await appearanceTwo.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await appearanceTwo.page.evaluate(()=>PlanoAppearance.get()),{mode:'dark',preset:'violet'});
  await require('./header-menu.cjs').open(appearanceTwo.page);await appearanceTwo.page.locator('#open-appearance').click();assert((await appearanceTwo.page.locator('#appearance-dialog').boundingBox()).width<=280);assert.equal(await appearanceTwo.page.locator('#appearance-sync').textContent(),'Tema guardado en tu cuenta');await appearanceTwo.page.screenshot({path:path.join(root,'tests/.output/apariencia-cuenta.png')});await appearanceTwo.page.locator('#close-appearance').click();
  await appearanceTwo.context.setOffline(true);await require('./header-menu.cjs').open(appearanceTwo.page);await appearanceTwo.page.locator('#toggle-theme').click();await appearanceTwo.page.evaluate(()=>PlanoAccountAppearance.flush());assert.equal(await appearanceTwo.page.evaluate(()=>PlanoAccountAppearance.info().status),'error');
  await appearanceTwo.context.setOffline(false);await appearanceTwo.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');assert.deepEqual(await preferences('ana','read',{}),{mode:'light',preset:'violet'});
  await require('./header-menu.cjs').open(appearanceTwo.page);await appearanceTwo.page.locator('#toggle-theme').click();await appearanceTwo.page.evaluate(()=>PlanoAccountAppearance.flush());
  await appearanceOne.context.setOffline(true);await require('./header-menu.cjs').open(appearanceOne.page);await appearanceOne.page.locator('#toggle-theme').click();await appearanceOne.page.evaluate(()=>PlanoAccountAppearance.flush());
  assert.equal(await appearanceOne.page.evaluate(()=>PlanoAccountAppearance.info().status),'error');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'dark',preset:'violet'});
  // El pendiente sobrevive al cierre de la pestaña, siempre asociado al UID.
  const offlineCache=await appearanceOne.page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('plano-appearance'))));
  await appearanceOne.context.close();
  const restored=await newDevice('ana');await restored.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  await restored.page.evaluate(values=>{for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);},offlineCache);
  await restored.page.reload();await restored.page.waitForFunction(()=>PlanoAccountAppearance?.info().status==='saved');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'light',preset:'violet'});
  // Una lectura lenta no revierte elecciones nuevas.
  let release;const held=new Promise(resolve=>release=resolve),slow=await newDevice('ana',{holdRead:held});
  await slow.page.waitForFunction(()=>PlanoAccountAppearance?.info().status==='loading');
  await require('./header-menu.cjs').open(slow.page);await slow.page.locator('#open-appearance').click();await slow.page.locator('[data-appearance-preset=blue]').click();release();
  await slow.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'light',preset:'blue'});
  // Cambiar de cuenta con una lectura pendiente no aplica el tema anterior.
  let releaseOld;const oldHeld=new Promise(resolve=>releaseOld=resolve),switcher=await newDevice('ana',{holdRead:oldHeld});
  await switcher.page.waitForFunction(()=>PlanoAccountAppearance?.info().status==='loading');
  await switcher.page.evaluate(async token=>{await cloudTestHooks.change('bob');PlanoAccounts.getUser=()=>({id:'bob'});PlanoAccounts.getAccessToken=async()=>token;document.dispatchEvent(new CustomEvent('plano-account-change'));},tokens.bob);
  releaseOld();await switcher.page.waitForFunction(()=>PlanoAccountAppearance.info().owner==='bob'&&PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await switcher.page.evaluate(()=>PlanoAppearance.get()),{mode:'light',preset:'default'});
  await require('./header-menu.cjs').open(switcher.page);await switcher.page.locator('#toggle-theme').click();await switcher.page.evaluate(()=>cloudTestHooks.beforeChange());
  assert.deepEqual(await preferences('bob','read',{}),{mode:'dark',preset:'default'},'Cerrar sesión termina el guardado de apariencia');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'light',preset:'blue'});
  for(const device of [appearanceTwo,restored,slow,switcher])await device.context.close();
  await db.exec('truncate public.plano_usage');
  console.log('OK apariencia de cuenta: restauración entre dispositivos, validación, permisos, cambios durante carga, caché pendiente, cierre de sesión y cambio de propietario durante una lectura.');
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Courier),sheet=doc.addPage([595,842]);sheet.drawText('INT. ESTUDIO - DIA',{x:65,y:770,size:12,font});sheet.drawText('La historia comienza.',{x:65,y:700,size:12,font});
  const continuation=doc.addPage([595,842]);continuation.drawText('La historia continua.',{x:65,y:700,size:12,font});
  const pdf=Buffer.from(await doc.save()),one=await newDevice();
  await one.page.locator('#file-input').setInputFiles({name:'Historia.pdf',mimeType:'application/pdf',buffer:pdf});await one.page.waitForFunction(()=>state.cloudProject&&!state.busy);
  const id=await one.page.evaluate(()=>state.cloudProject.id);
  const beforeManual=(await rpc('ana','read',id,{})).revision;
  await one.page.locator('#open-cloud').click();await one.page.waitForFunction(revision=>PlanoCloud.info().status==='saved'&&PlanoCloud.info().project.revision>revision,beforeManual);
  assert.equal(await one.page.locator('dialog[open]').count(),0,'La nube guarda directamente sin abrir ventanas');
  assert(await one.page.locator('#open-cloud .cloud-mark-check').isVisible(),'La confirmación de servidor se refleja en el icono');
  assert.equal(await one.page.locator('#feedback').textContent(),'Proyecto guardado en tu cuenta.','Confirma el guardado manual con un aviso discreto, sin abrir diálogos');
  async function edit(page,name){
   await page.evaluate(name=>{state.annotations=[{id:'test-line',shotId:'test-line',type:'line',page:1,endPage:2,color:'#e8b83f',start:{x:.85,y:.2},end:{x:.85,y:.4},shotName:name,description:'Una descripción de prueba',grip:'Trípode',sound:'Ambiente',note:'Nota privada',scriptSelection:[{page:1,text:'La historia comienza.',rects:[{x:.11,y:.15,width:.3,height:.02}]}]}];changed();},name);
  }
  await edit(one.page,'Plano A');await one.page.waitForFunction(()=>PlanoCloud.info().status==='saved');
  await one.page.evaluate(()=>{state.annotations[0].labelUnrestricted=true;state.crew={roles:[{id:"sound",label:"Sonidista",name:"Ana Ruiz"},{id:"producer",label:"Productora",name:"Luis Pérez"},{id:"custom",label:"Montaje",name:"Luz Films"}]};state.proofreading={enabled:false,dictionary:"",ignored:["planosecuencia"]};state.corrections=[PlanoCorrections.create([{page:1,text:'La historia comienza.',rects:[{x:.11,y:.15,width:.3,height:.02}]}],state.pdf.numPages)];changed();});await one.page.waitForFunction(()=>PlanoCloud.info().status==='saved');
  await one.page.evaluate(()=>{state.corrections.push({...PlanoCorrections.create([{page:1,text:'un una',rects:[{x:.11,y:.2,width:.1,height:.02}]}],state.pdf.numPages),source:'syntax',word:'un una',ignoreKey:'syntax:double-article:sample',message:'Hay dos artículos seguidos; revisa cuál corresponde.'});changed();});await one.page.waitForFunction(()=>PlanoCloud.info().status==='saved');
  assert.equal(uploads,0,'La conversión local no sube el PDF ni siquiera al crear el guion');
  assert.equal(await one.page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('plano-notes'))),false,'Los cambios de nube no se guardan en el dispositivo');
  const two=await newDevice();
  await two.page.locator('#account-storage').waitFor();
  await two.page.getByRole('button',{name:'Abrir proyecto Historia',exact:true}).click();
  assert(await two.page.locator('#project-overview').isVisible());
  assert(await two.page.locator('#account-storage').isHidden());
  assert(await two.page.locator('#open-patch-notes').isHidden());
  assert.equal(await two.page.locator('[data-project-stage]').count(),3);
  await two.page.locator('[data-project-stage=coverage]').click();await two.page.waitForFunction(()=>state.cloudProject&&!state.busy);
  assert.equal(await two.page.evaluate(()=>state.annotations[0].shotName),'Plano A','Otro dispositivo recupera PDF y planos');assert.equal(await two.page.evaluate(()=>state.annotations[0].endPage),2,'La cuenta conserva la continuación entre páginas');
  assert.equal(await two.page.evaluate(()=>state.annotations[0].scriptSelection[0].text),'La historia comienza.','La cuenta conserva el fragmento vinculado a la línea');
  assert.equal(await two.page.evaluate(()=>state.annotations[0].labelUnrestricted),true,'La cuenta conserva el permiso de colocar el título sobre contenido');
  assert.equal(await two.page.evaluate(()=>state.corrections[0].parts[0].text),'La historia comienza.','Las correcciones editoriales se recuperan en otro dispositivo');
  assert.equal(await two.page.evaluate(()=>state.corrections.length),1,'Una corrección automática sin texto asociado se vuelve a calcular, sin modificar la corrección manual');
  assert.deepEqual(await two.page.evaluate(()=>state.crew),{roles:[{id:"sound",label:"Sonidista",name:"Ana Ruiz"},{id:"producer",label:"Productora",name:"Luis Pérez"},{id:"custom",label:"Montaje",name:"Luz Films"}]},"El equipo se recupera desde otra cuenta/dispositivo");assert.deepEqual(await two.page.evaluate(()=>state.proofreading),{enabled:false,dictionary:"",ignored:["planosecuencia"]},"La configuración de revisión se guarda con el guion");
  await one.context.setOffline(true);await edit(one.page,'Sin conexión');await one.page.locator('#open-cloud').click();await one.page.waitForFunction(()=>document.querySelector('#open-cloud').dataset.syncState==='error');assert.equal(await one.page.evaluate(()=>PlanoCloud.info().status),'error');assert((await one.page.locator('#feedback').textContent()).includes('Sin conexión'));assert(await one.page.locator('#open-cloud .cloud-mark-error').isVisible());
  assert.equal((await rpc('ana','read',id,{})).payload.annotations[0].shotName,'Plano A');
  await assert.rejects(one.page.evaluate(()=>cloudTestHooks.beforeChange()),/Cloud save pending/,'No se cierra sesión fingiendo que se guardó');
  await one.context.setOffline(false);await one.page.waitForFunction(()=>PlanoCloud.info().status==='saved');
  await edit(two.page,'Cambios de otra pestaña');await two.page.evaluate(()=>PlanoCloud.flush().catch(()=>{}));
  assert.equal(await two.page.evaluate(()=>PlanoCloud.info().status),'conflict');assert.equal((await rpc('ana','read',id,{})).payload.annotations[0].shotName,'Sin conexión');
  assert(await two.page.locator('#cloud-reload').isVisible());
  const download=two.page.waitForEvent('download');await two.page.locator('#cloud-export-draft').click();await two.page.locator('#export-editable').click();const backup=await download;assert(backup.suggestedFilename().endsWith('.plano'));
  await two.page.locator('#cloud-reload').click();await two.page.waitForFunction(()=>state.annotations[0].shotName==='Sin conexión');
  await projectHome(two.page);await two.page.locator('#project-rename').click();await two.page.locator('#rename-file-input').fill('Historia final');await two.page.locator('#save-file-rename').click();await two.page.locator('#rename-file-dialog').waitFor({state:'hidden'});
  assert.equal((await rpc('ana','read',id,{})).project_name,'Historia final');
  assert.equal((await rpc('ana','read',id,{})).payload.screenplay.title,'Historia final');
  assert.equal(await two.page.locator('#page-title').textContent(),'Historia final');
  assert(await two.page.locator('#file-name').isHidden());
  assert.equal(await two.page.evaluate(()=>state.file.name),'Historia.pdf','Renombrar la carpeta conserva el nombre del archivo');
  await two.page.locator('[data-project-stage=coverage]').click();
  await two.page.waitForFunction(()=>state.screen==='editor'&&state.rendered&&!state.busy);
  assert.equal(await two.page.locator('#file-name').textContent(),'Historia final');
  // El nombre en el editor es el de la carpeta y guarda los cambios pendientes antes de renombrar.
  const originalDocumentName=(await rpc('ana','read',id,{})).name;
  await edit(two.page,'Sin conexión');
  await two.page.locator('#file-name').click();await two.page.locator('#project-title-input').fill('Historia provisional');await two.page.locator('#open-cloud').click();await two.page.locator('#project-title-form').waitFor({state:'hidden'});await two.page.waitForFunction(()=>document.querySelector('#open-cloud').dataset.syncState==='saved'&&document.querySelector('#open-cloud').getAttribute('aria-busy')==='false');assert(await two.page.locator('#feedback').isVisible());assert.equal(await two.page.locator('#feedback').textContent(),'Proyecto guardado en tu cuenta.','La nube confirma el renombrado y el proyecto al pulsarla mientras se edita el título');
  assert.equal(await two.page.locator('dialog[open]').count(),0,'El nombre se guarda sin ventanas');
  let inlineProject=await rpc('ana','read',id,{});assert.equal(inlineProject.project_name,'Historia provisional');assert.equal(inlineProject.payload.screenplay.title,'Historia provisional');assert.equal(inlineProject.payload.annotations[0].shotName,'Sin conexión');assert.equal(inlineProject.name,originalDocumentName);
  await two.page.locator('#file-name').click();await two.page.locator('#project-title-input').fill('Historia final');await two.page.locator('#project-title-input').press('Tab');await two.page.locator('#project-title-form').waitFor({state:'hidden'});
  assert.equal((await rpc('ana','read',id,{})).project_name,'Historia final');assert.equal(await two.page.evaluate(()=>PlanoCloud.info(false).status),'saved');
  if(await two.page.locator('#project-overview').isHidden())await projectHome(two.page);await two.page.locator('#project-overview').waitFor();assert.equal(await two.page.locator('#page-title').textContent(),'Historia final');await two.page.locator('#project-root').click();await two.page.locator('.script-card-name').filter({hasText:'Historia final'}).waitFor();await two.page.locator('.script-card-preview img').waitFor();
  assert.equal(await two.page.locator('.script-card').count(),1);assert(await two.page.locator('#upload-button .new-script-plus').isVisible());
  await two.page.evaluate(()=>PlanoCloudLibrary.finishPreview());await two.page.waitForFunction(()=>document.querySelector('#account-storage').dataset.state==='ready');
  const expectedUsed=Number((await db.query("select coalesce(sum(size_bytes),0) used from public.plano_projects where owner_id='ana' and storage_kind='editable'")).rows[0].used);
  assert.equal(await two.page.locator('#storage-meter').evaluate(el=>el.value),expectedUsed,'El indicador usa los bytes confirmados por la base de datos');assert.equal(await two.page.locator('#storage-meter').evaluate(el=>el.max),3500000);assert((await two.page.locator('#storage-summary').textContent()).includes('disponibles'));assert((await two.page.locator('#storage-policy').textContent()).includes('350 KB'));
  const previousStorage=await two.page.locator('#storage-summary').textContent();await two.context.setOffline(true);await two.page.locator('#home-refresh').click();await two.page.waitForFunction(()=>document.querySelector('#account-storage').dataset.state==='stale');assert.equal(await two.page.locator('#storage-summary').textContent(),previousStorage,'Un fallo de red no inventa cero bytes');assert((await two.page.locator('#storage-freshness').textContent()).includes('Última consulta'));await two.context.setOffline(false);await two.page.locator('#home-refresh').click();await two.page.waitForFunction(()=>document.querySelector('#account-storage').dataset.state==='ready');
  assert.equal(await two.page.evaluate(()=>Object.values(localStorage).some(value=>value.includes('data:image/jpeg'))),false,'Las miniaturas privadas no se escriben en localStorage');
  const summary=(await rpc('ana','list',null,{})).projects[0];assert(summary.thumbnail.startsWith('data:image/jpeg;base64,')&&summary.thumbnail.length<=20000);assert(!('payload'in summary),'La biblioteca no descarga todas las notas');
  await two.page.locator('.script-rename').click();await two.page.locator('#rename-file-input').fill('   ');await two.page.locator('#save-file-rename').click();assert(await two.page.locator('#rename-file-dialog').isVisible());
  await two.page.locator('#rename-file-input').fill('Guion desde el inicio');await two.page.locator('#save-file-rename').click();await two.page.locator('#rename-file-dialog').waitFor({state:'hidden'});await two.page.locator('.script-card-name').filter({hasText:'Guion desde el inicio'}).waitFor();assert(await two.page.locator('#file-name').isHidden(),'La biblioteca raíz no muestra un proyecto sin seleccionar');assert.equal((await rpc('ana','read',id,{})).project_name,'Guion desde el inicio');
  await two.page.screenshot({path:path.join(root,'tests/.output/biblioteca-guiones-claro.png'),fullPage:true});await require('./header-menu.cjs').open(two.page);await two.page.locator('#toggle-theme').click();await two.page.screenshot({path:path.join(root,'tests/.output/biblioteca-guiones-oscuro.png'),fullPage:true});
  // Otro dispositivo recibe la miniatura sin volver a descargar el archivo.
  let releaseList,listCalls=0;const heldList=new Promise(resolve=>releaseList=resolve);
  const library=await newDevice('ana',{holdList:heldList,onList:()=>listCalls++});
  await library.page.evaluate(()=>{globalThis.concurrentLibraryReads=Promise.all([PlanoCloudLibrary.showHome(),PlanoCloudLibrary.showHome(),PlanoCloudLibrary.showHome()]);});
  releaseList();await library.page.evaluate(()=>concurrentLibraryReads);
  await library.page.locator('.script-card-preview img').waitFor();assert.equal(listCalls,1,'Las cargas simultáneas del inicio comparten una única petición a la biblioteca');assert(await library.page.locator('#account-storage').isVisible());
  assert.equal(await library.page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('action=download')).length),0);await library.context.close();
  // Un PDF antiguo muestra una portada provisional; solo se descarga al abrirlo para convertirlo.
  const legacyDoc=await PDFDocument.create(),legacyFont=await legacyDoc.embedFont(StandardFonts.Courier);legacyDoc.addPage([595,842]).drawText('LA SIGUIENTE HISTORIA',{x:85,y:600,size:18,font:legacyFont});
  const legacyProject=(await create(Buffer.from(await legacyDoc.save()),'La siguiente historia.pdf')).project;await two.page.locator('#home-refresh').click();await two.page.locator(`.script-card[data-project-id="${legacyProject.id}"] .script-preview-fallback`).waitFor();await two.page.evaluate(()=>PlanoCloudLibrary.finishPreview());
  assert.equal(await two.page.locator(`.script-card[data-project-id="${legacyProject.id}"] img`).count(),0);assert.equal((await rpc('ana','read',legacyProject.id,{})).revision,legacyProject.revision);assert.equal((await rpc('ana','read',legacyProject.id,{})).payload.annotations.length,0);
  await two.page.screenshot({path:path.join(root,'tests/.output/biblioteca-guiones-varios.png'),fullPage:true});
  // «+» permite elegir escritura o importación; las tarjetas abren el guion correspondiente.
  await two.page.locator('#upload-button').click();const chooser=two.page.waitForEvent('filechooser');await two.page.locator('#project-attach-script').click();await chooser;await two.page.locator('#cancel-new-script').click();
  await two.page.locator(`.script-card[data-project-id="${id}"] .script-card-open`).click();await two.page.locator('[data-project-stage=writing]').click();await two.page.waitForFunction(()=>state.screen==='editor'&&!state.busy);assert.equal(await two.page.locator('#file-name').textContent(),'Guion desde el inicio');assert.equal((await rpc('ana','read',id,{})).project_name,'Guion desde el inicio');
  assert(await two.page.locator('#writer-title-paper').isVisible());assert.equal(await two.page.evaluate(()=>state.stage),'writing');await two.page.waitForFunction(()=>Boolean(PlanoWriter.view()));assert((await two.page.evaluate(()=>PlanoWriter.view().state.doc.textContent)).includes('La historia comienza.'));
  await projectHome(two.page);await two.page.locator('[data-project-stage=technical]').click();await two.page.waitForFunction(()=>state.stage==='technical'&&!state.busy);assert(await two.page.locator('#technical-view').isVisible());assert.equal(await two.page.locator('#technical-table-body tr[data-shot-id]').count(),1);
  assert.equal(await two.page.evaluate(()=>state.screenplayCoverage),undefined,'La cobertura usa la escritura actual');
  await projectHome(two.page);await two.page.locator('[data-project-stage=coverage]').click();await two.page.waitForFunction(()=>state.stage==='coverage'&&state.rendered&&!state.busy);assert.equal(await two.page.evaluate(()=>state.annotations[0].shotName),'Sin conexión');
  await projectHome(two.page);await two.page.screenshot({path:path.join(root,'tests/.output/carpeta-proyecto.png'),fullPage:true});await two.page.setViewportSize({width:390,height:844});assert(await two.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await two.page.screenshot({path:path.join(root,'tests/.output/carpeta-proyecto-movil.png'),fullPage:true});await two.page.locator('#project-root').click();await two.page.locator(`.script-card[data-project-id="${legacyProject.id}"]`).waitFor();
  await two.page.setViewportSize({width:390,height:844});assert(await two.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await two.page.screenshot({path:path.join(root,'tests/.output/biblioteca-guiones-movil.png'),fullPage:true});
  await two.page.setViewportSize({width:1440,height:1000});await two.page.locator(`.script-card[data-project-id="${legacyProject.id}"] .script-card-open`).click();await two.page.locator('[data-project-stage=writing]').click();await two.page.waitForFunction(id=>state.cloudProject?.id===id&&!state.busy,legacyProject.id);assert.equal(await two.page.evaluate(()=>state.stage),'writing');assert.equal(await two.page.evaluate(()=>state.annotations.length),0,'La carpeta abre el guion del proyecto seleccionado');
  await projectHome(two.page);await two.page.locator('#project-root').click();await two.page.locator(`.script-card[data-project-id="${id}"] .script-card-open`).click();await two.page.locator('[data-project-stage=coverage]').click();await two.page.waitForFunction(id=>state.cloudProject?.id===id&&state.rendered&&!state.busy,id);assert.equal(await two.page.evaluate(()=>state.annotations[0].shotName),'Sin conexión');await projectHome(two.page);await two.page.locator('#project-root').click();
  await rpc('ana','delete_begin',legacyProject.id,{revision:(await rpc('ana','read',legacyProject.id,{})).revision});await rpc('ana','delete_finish',legacyProject.id,{});files.delete('ana/'+legacyProject.id);await two.page.locator('#home-refresh').click();
  await two.page.waitForFunction(()=>document.querySelectorAll('.script-card').length===1);
  const other=await newDevice('bob');await other.page.waitForFunction(()=>document.querySelector('#account-storage').dataset.state==='ready');assert.equal(await other.page.locator('.script-card').count(),0);assert.equal(await other.page.locator('#storage-meter').evaluate(el=>el.value),0,'La otra cuenta tiene su propio consumo');assert((await other.page.locator('#storage-summary').textContent()).includes('3,5 MB disponibles'));
  await two.page.screenshot({path:path.join(root,'tests/.output/proyectos-nube.png'),fullPage:true});
  await two.page.setViewportSize({width:390,height:844});assert(await two.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await two.page.locator('.script-delete').click();await two.page.waitForFunction(()=>document.querySelectorAll('.script-card').length===0);assert.equal(files.size,0);assert.equal(await two.page.evaluate(()=>state.pdf),null);assert.equal(await two.page.locator('#storage-meter').evaluate(el=>el.value),0,'Borrar el último proyecto libera el espacio mostrado');
  await one.page.evaluate(()=>{PlanoCloud.changeOwner('');closeDocument();});
  // Guiones nativos: el borrador se guarda en la misma cuenta y el PDF se regenera al abrir.
  // Cada bloque funcional recibe su propia cuota; la ráfaga automatizada anterior no es uso real.
  await db.exec('truncate public.plano_usage');
  await two.page.setViewportSize({width:1440,height:1000});
  await two.page.evaluate(()=>{PlanoAccounts.getUser=()=>({id:'ana',name:'Ana Ruiz',email:'ana@example.invalid'});});
  await two.page.locator('#upload-button').click();await two.page.locator('#project-info-name').fill('Sin título');await two.page.locator('#project-info-genre').fill('Terror');await two.page.locator('#project-info-duration').fill('10');await two.page.locator('#project-info-country').fill('Colombia');await two.page.locator('#project-info-language').fill('Español');await two.page.locator('#create-project').click();await two.page.waitForFunction(()=>!creatingScript&&state.screenplay&&PlanoWriter.view());
  assert.equal(await two.page.locator('.writer-author input').first().inputValue(),'Ana Ruiz');assert.equal(await two.page.locator('[data-author-field=email]').first().inputValue(),'ana@example.invalid');
  await two.page.locator('#writer-project-title').fill('Guion de la cuenta');await two.page.locator('#writer-project-title').press('Tab');await two.page.waitForFunction(()=>state.file.name==='Guion de la cuenta.pdf');
  await two.page.locator('#writer-body-tab').click();await two.page.locator('.writer-editor').click();await two.page.keyboard.insertText('INT. CASA - DÍA');await two.page.keyboard.press('Enter');await two.page.keyboard.insertText('La historia se escribe en la cuenta.');await two.page.evaluate(()=>PlanoCloud.flush());
  const nativeId=await two.page.evaluate(()=>state.cloudProject.id),native=await rpc('ana','read',nativeId,{});assert.equal(native.payload.screenplay.title,'Guion de la cuenta');assert.equal(native.project_name,native.payload.screenplay.title);assert(native.payload.screenplay.doc.content.some(node=>node.content?.some(piece=>piece.text.includes('La historia se escribe'))));
  assert.deepEqual(await two.page.evaluate(()=>PlanoCloud.preview(PlanoCloud.info().project).screenplay),native.payload.screenplay,'La vista en memoria incluye el texto que el servidor confirmó');
  assert.deepEqual(await two.page.evaluate(()=>{
   let notification;const unsubscribe=PlanoCloud.subscribe(info=>notification=info,{payload:false});unsubscribe();
   const snapshot=PlanoCloud.info(),title=snapshot.project.payload.screenplay.title;snapshot.project.payload.screenplay.title='Cambio ajeno al guardado';
   return{metadataOnly:!Object.hasOwn(notification.project,'payload'),snapshotIsolated:PlanoCloud.info().project.payload.screenplay.title===title};
  }),{metadataOnly:true,snapshotIsolated:true},'Los avisos de interfaz omiten el documento y las copias públicas siguen aisladas del borrador privado');
  assert.equal(native.payload.projectInfo.genre,'Terror');assert.equal(native.payload.projectInfo.estimatedMinutes,10);
  await rpc('ana','rename_project',nativeId,{revision:native.revision,name:'Sin título'});
  const recovery=await newDevice();
  await recovery.page.locator(`.script-card[data-project-id="${nativeId}"] .script-card-open`).click();
  await recovery.page.waitForFunction(()=>document.querySelector('#page-title').textContent==='Guion de la cuenta');
  await recovery.page.locator('[data-project-stage=writing]').click();
  await recovery.page.waitForFunction(()=>state.screenplay&&PlanoWriter.view()&&!state.busy);
  assert.equal(await recovery.page.locator('#file-name').textContent(),'Guion de la cuenta');
  assert.equal(await recovery.page.locator('#writer-project-title').inputValue(),'Guion de la cuenta');
  await recovery.page.evaluate(()=>PlanoCloud.flush());
  assert.equal((await rpc('ana','read',nativeId,{})).project_name,'Guion de la cuenta');
  await recovery.context.close();
  const writerDevice=await newDevice();await writerDevice.page.locator(`.script-card[data-project-id="${nativeId}"] .script-card-open`).click();
  await writerDevice.page.locator('#project-facts').getByRole('button',{name:'Editar ficha'}).click();
  assert.equal(await writerDevice.page.locator('#project-info-duration').inputValue(),'10');
  await writerDevice.page.locator('#project-info-name').fill('Proyecto de terror');
  await writerDevice.page.locator('#project-icon-button').click();
  await writerDevice.page.locator('#project-emoji-search').fill('👻');
  await writerDevice.page.locator('#project-add-author').click();
  await writerDevice.page.locator('[data-author-name]').last().fill('Eva Ríos');
  await writerDevice.page.route(url=>url.href===endpoint+'?action=save',route=>route.abort(),{times:1});
  await writerDevice.page.locator('#create-project').click();
  await writerDevice.page.locator('#project-info-error').waitFor();
  const interrupted=await rpc('ana','read',nativeId,{});
  assert.equal(interrupted.payload.projectInfo.completed,false);
  assert.equal(interrupted.payload.screenplayVersions,undefined);
  await writerDevice.page.route(url=>url.href===endpoint+'?action=rename_project',route=>route.abort(),{times:1});
  await writerDevice.page.locator('#create-project').click();
  await writerDevice.page.waitForFunction(()=>document.querySelector('#project-info-error').textContent.includes('Reintenta para actualizar'));
  const partiallySaved=await rpc('ana','read',nativeId,{});
  assert.equal(partiallySaved.project_name,'Guion de la cuenta');
  assert.equal(partiallySaved.payload.screenplay.title,'Proyecto de terror');
  assert.equal(partiallySaved.payload.screenplayVersions?.length??0,0);
  await writerDevice.page.locator('#create-project').click();
  await writerDevice.page.waitForFunction(()=>!document.querySelector('#new-script-dialog').open);
  assert.equal(await writerDevice.page.evaluate(()=>state.screenplay),null,'Editar la ficha desde la carpeta no abre ni genera las páginas del editor');
  await writerDevice.page.locator('[data-project-stage=writing]').click();await writerDevice.page.waitForFunction(()=>state.screenplay&&PlanoWriter.view()&&!state.busy);
  await writerDevice.page.locator('#finalize-screenplay').click();
  assert.match(await writerDevice.page.locator('#finalize-screenplay-duration').textContent(),/1 min/);
  await writerDevice.page.route(url=>url.href===endpoint+'?action=save',route=>route.abort(),{times:1});
  await writerDevice.page.locator('#confirm-screenplay-finalization').click();
  await writerDevice.page.locator('#finalize-screenplay-error').waitFor();
  const failedFinalization=await rpc('ana','read',nativeId,{});
  assert.equal(failedFinalization.payload.projectInfo.completed,false);
  assert.equal(failedFinalization.payload.screenplayVersions?.length??0,0);
  await writerDevice.page.locator('#confirm-screenplay-finalization').click();
  await writerDevice.page.locator('#finalize-screenplay-dialog').waitFor({state:'hidden'});
  const remoteInfo=await rpc('ana','read',nativeId,{});assert(remoteInfo.payload.projectInfo.completed);assert.equal(remoteInfo.payload.projectInfo.estimatedMinutes,10);assert.equal(remoteInfo.payload.screenplay.authors[1].name,'Eva Ríos');assert.equal(remoteInfo.project_name,'Proyecto de terror');
  assert.equal(remoteInfo.payload.projectInfo.emoji,'👻');
  const iconDevice=await newDevice();
  const card=iconDevice.page.locator(`.script-card[data-project-id="${nativeId}"]`);
  await card.locator('.project-folder-symbol .project-emoji').waitFor();
  assert.equal(await card.locator('.project-folder-symbol').textContent(),'👻');
  assert.equal((await rpc('ana','list',null,{})).projects.find(project=>project.id===nativeId).project_emoji,'👻');
  assert(!(await rpc('bob','list',null,{})).projects.some(project=>project.id===nativeId));
  await iconDevice.context.close();
  assert.equal(remoteInfo.payload.screenplayVersions[0].number,1);
  assert.equal(remoteInfo.payload.screenplayVersions.length,1);
  const archivedScript=await require('../screenplay-versions.js').read(remoteInfo.payload.screenplayVersions[0]);
  assert.equal(archivedScript.title,'Proyecto de terror');
  assert.equal(archivedScript.authors[1].name,'Eva Ríos');
  assert.equal(await writerDevice.page.evaluate(()=>state.projectInfo.completed),true);assert.equal(await writerDevice.page.locator('#writer-project-title').inputValue(),'Proyecto de terror');assert((await writerDevice.page.evaluate(()=>PlanoWriter.view().state.doc.textContent)).includes('La historia se escribe en la cuenta.'));
  await writerDevice.page.locator('#stage-tabs [data-stage=coverage]').click();await writerDevice.page.waitForFunction(()=>state.rendered&&!state.busy);assert.equal(await writerDevice.page.evaluate(()=>state.scenes.length),1);assert((await writerDevice.page.evaluate(()=>state.pages.flatMap(p=>p.lines).map(l=>l.text).join(' '))).includes('La historia se escribe en la cuenta.'));
  assert.equal(await writerDevice.page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('plano-notes'))),false,'El texto del redactor no se escribe en almacenamiento local con la nube activa');
  await writerDevice.page.evaluate(()=>{state.annotations=validateNotes([{id:'native-line',shotName:'P1',type:'line',page:2,color:'#e8b83f',start:{x:.8,y:.2},end:{x:.8,y:.5}}]);changed();});await writerDevice.page.locator('#stage-tabs [data-stage=writing]').click();await writerDevice.page.evaluate(()=>{const view=PlanoWriter.view();view.dispatch(view.state.tr.insertText('REVISIÓN ',1));});await writerDevice.page.evaluate(()=>PlanoCloud.flush());
  const writtenBackup=(await rpc('ana','read',nativeId,{})).payload;await writerDevice.page.evaluate(()=>{const view=PlanoWriter.view();view.dispatch(view.state.tr.insertText('OTRO BORRADOR ',1));});await writerDevice.page.evaluate(()=>PlanoCloud.flush());
  assert.equal(writtenBackup.screenplay.edition,2);assert.equal(writtenBackup.projectInfo.completed,false);assert.deepEqual(writtenBackup.screenplayVersions,remoteInfo.payload.screenplayVersions);
  await writerDevice.page.evaluate(data=>restoreWrittenBackup(data),writtenBackup);assert.deepEqual((await rpc('ana','read',nativeId,{})).payload.screenplay,writtenBackup.screenplay,'Restaurar conserva el texto completo de la copia en la cuenta');assert.deepEqual((await rpc('ana','read',nativeId,{})).payload.projectInfo,writtenBackup.projectInfo);assert.equal((await rpc('ana','read',nativeId,{})).payload.screenplayCoverage,undefined,'La restauración usa el texto actual y sus vínculos');assert.equal(await writerDevice.page.evaluate(()=>state.annotations[0].shotName),'P1');
  await writerDevice.page.evaluate(()=>PlanoCloud.flush());const latest=await rpc('ana','read',nativeId,{});await rpc('ana','delete_begin',nativeId,{revision:latest.revision});await rpc('ana','delete_finish',nativeId,{});files.delete('ana/'+nativeId);await writerDevice.context.close();
  assert.deepEqual(errors,[]);
  console.log('OK navegador: subida, autoguardado, biblioteca con miniaturas entre dispositivos y guiones antiguos, sin copias locales, renombrado desde inicio/editor, +, apertura, desconexión/recuperación, conflicto sin sobrescritura, copia JSON, borrado, aislamiento entre cuentas y móvil.');
 }finally{if(browser)await browser.close();await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
