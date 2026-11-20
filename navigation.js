/* Rutas locales: GitHub Pages recibe siempre index.html, también al recargar. */
(function(root){
 'use strict';
 const home={section:'projects'},stages={writing:'guion',coverage:'cobertura',technical:'guion-tecnico'},accounts={profile:'perfil',security:'seguridad',privacy:'privacidad'};
 let hooks,started=false,applying=false,scheduled=false,pending=null,accepted=null,returning=false,owner='';
 const previous=history.state?.planoNavigation;
 const session=previous?.version===1?previous.session:crypto.randomUUID();
 let index=previous?.version===1?previous.index:0;
 function path(route=home){
  if(route.section==='account')return '#/cuenta/'+(accounts[route.tab]||'perfil');
  if(route.project){
   const base='#/proyectos/'+encodeURIComponent(route.project);
   if(route.section==='characters')return base+'/personajes'+(route.tree?'/relaciones':'');
   return base+(stages[route.section]?'/'+stages[route.section]:'');
  }
  return '#/proyectos';
 }
 function parse(hash){
  let parts;try{parts=hash.replace(/^#\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);}catch{return null;}
  if(!parts.length||parts.length===1&&parts[0]==='proyectos')return {...home};
  if(parts[0]==='cuenta'&&parts.length===2){const tab=Object.keys(accounts).find(key=>accounts[key]===parts[1]);return tab?{section:'account',tab}:null;}
  if(parts[0]!=='proyectos'||!parts[1]||parts[1].length>180)return null;
  const project=parts[1];
  if(parts.length===2)return {section:'project',project};
  if(parts[2]==='personajes'&&(parts.length===3||parts.length===4&&parts[3]==='relaciones'))return {section:'characters',project,tree:parts.length===4};
  const section=Object.keys(stages).find(key=>stages[key]===parts[2]);
  return parts.length===3&&section?{section,project}:null;
 }
 function write(hash,replace=false){
  if(!replace)index++;
  const marker={version:1,session,index};
  history[replace?'replaceState':'pushState']({planoNavigation:marker},'',hash);
  accepted={hash,marker};
 }
 function changed(){
  if(!started||applying||pending||returning||scheduled)return;
  scheduled=true;queueMicrotask(()=>{
   scheduled=false;if(!started||applying||pending||returning||!root.PlanoAccounts.getUser())return;
   const hash=path(hooks.snapshot());if(hash!==accepted?.hash)write(hash);
  });
 }
 function reject(target){
  hooks.blocked?.();
  const marker=target.marker;
  if(marker?.session===session&&Number.isSafeInteger(marker.index)&&accepted&&marker.index!==accepted.marker.index){
   returning=true;history.go(accepted.marker.index-marker.index);
  }else if(accepted){index=accepted.marker.index;write(accepted.hash,true);}
 }
 async function drain(){
  if(applying||!started||!root.PlanoAccounts.getUser())return;
  applying=true;
  try{
   while(pending){
    const target=pending;pending=null;
    if(target.hash===accepted?.hash){
     if(target.marker?.session===session){index=target.marker.index;accepted={hash:target.hash,marker:target.marker};}
     continue;
    }
    if(accepted&&!hooks.canNavigate()){reject(target);break;}
    const identity=root.PlanoAccounts.getUser()?.id;
    await hooks.restore(parse(target.hash)||home);
    if(identity!==root.PlanoAccounts.getUser()?.id)break;
    index=target.marker?.session===session&&Number.isSafeInteger(target.marker.index)?target.marker.index:index+(accepted?1:0);
    if(pending){
     accepted={hash:path(hooks.snapshot()),marker:{version:1,session,index}};
     continue; // Atrás/Adelante rápido: la última petición manda.
    }
    write(path(hooks.snapshot()),true);
   }
  }finally{applying=false;}
 }
 function traverse(){
  if(!started)return;
  const hash=location.hash,marker=history.state?.planoNavigation;
  if(returning){
   if(hash===accepted?.hash&&marker?.index===accepted.marker.index){returning=false;pending=null;}
   return;
  }
  // popstate y hashchange pueden describir el mismo paso.
  if(hash===accepted?.hash&&!applying){
   if(marker?.session===session){index=marker.index;accepted={hash,marker};}
   return;
  }
  pending={hash,marker};void drain();
 }
 async function activate(){
  if(!root.PlanoAccounts.getUser())return;
  const nextOwner=root.PlanoAccounts.getUser().id;
  if(started&&owner===nextOwner)return;
  const first=!started;owner=nextOwner;started=true;
  if(first){pending={hash:location.hash,marker:history.state?.planoNavigation};await drain();if(!accepted)write(path(hooks.snapshot()),true);}
  else{pending=null;write(path(hooks.snapshot()),true);}
 }
 function init(options){
  hooks=options;
  // El salto accesible al contenido no es otra pantalla ni cambia la ruta.
  document.querySelector('.skip-link')?.addEventListener('click',event=>{
   event.preventDefault();document.querySelector('#main-content')?.focus();
  });
  root.addEventListener('popstate',traverse);root.addEventListener('hashchange',traverse);
  document.addEventListener('plano-account-change',()=>{
   if(!root.PlanoAccounts.getUser()){owner='';pending=null;return;}
   void activate();
  });
  Promise.all([root.PlanoAccounts.ready,document.readyState==='loading'?new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true})):Promise.resolve()]).then(activate);
 }
 root.PlanoHistory={init,changed,path,parse};
})(globalThis);
