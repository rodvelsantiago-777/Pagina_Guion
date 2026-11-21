const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const Family=require('../character-family.js'),S=require('../screenplay.js'),Archive=require('../project-archive.js');
const {chromium}=require('./runtime-deps.cjs').load('playwright'),{launch}=require('./editor-auth-fixture.cjs');
const base={surnames:'',gender:'',role:'',aliases:[]};
const profiles=S.validateProfiles([
 {...base,id:'monica',givenNames:'Mónica Raquel Flores Ortiga',age:'52',gender:'Mujer',relationshipPosition:{x:0,y:0},details:{relationships:[{targetId:'daniel',type:'Romance',married:true,broken:true},{targetId:'angela',type:'Familia',parentId:'monica'},{targetId:'hermana',type:'Familia',parentId:'monica'}],feelings:[{targetId:'angela',feeling:'Amor'}]}},
 {...base,id:'daniel',givenNames:'Daniel Arturo Márquez Reyes',age:'60',details:{relationships:[{targetId:'angela',type:'Familia',parentId:'daniel'},{targetId:'hermana',type:'Familia',parentId:'daniel'},{targetId:'jaima',type:'Romance',married:true},{targetId:'jaimita',type:'Familia',parentId:'daniel'}],feelings:[{targetId:'monica',feeling:'Desprecio'},{targetId:'angela',feeling:'Rencor'}]}},
 {...base,id:'jaima',givenNames:'Jaima',age:'42',details:{relationships:[{targetId:'jaimita',type:'Familia',parentId:'jaima'}]}},
 {...base,id:'angela',givenNames:'Ángela',age:'17',details:{relationships:[{targetId:'amiga',type:'Amistad'}],feelings:[{targetId:'monica',feeling:'Indiferencia'},{targetId:'amiga',feeling:'Cariño'}]}},
 {...base,id:'hermana',givenNames:'Hermana',age:'19'},
 {...base,id:'jaimita',givenNames:'Jaimita',age:'5'},
 {...base,id:'amiga',givenNames:'Amiga de Ángela',age:'17',details:{feelings:[{targetId:'angela',feeling:'Admiración'}]}},
 {...base,id:'otra-madre',givenNames:'Otra madre',age:'55',details:{relationships:[{targetId:'otra-hija',type:'Familia',parentId:'otra-madre'}]}},
 {...base,id:'otra-hija',givenNames:'Otra hija',age:'20'},
]);
const links=profiles.flatMap(p=>(p.details?.relationships||[]).map(link=>({source:p.id,target:link.targetId,type:link.type,parentId:link.parentId})));
const data=profiles.map(p=>({key:p.id,age:p.age,position:p.relationshipPosition}));
const layout=Family.layoutByAge(data,links);
for(const [key,at] of layout){assert.equal(at.x%80,0);assert.equal(Math.abs(at.y%80),0);assert.equal(at.y,-Family.ageRow(Family.ageYears(profiles.find(p=>p.id===key).age))*80);}
assert.equal(layout.get('angela').y-layout.get('jaimita').y,-160,'No colapsa franjas vacías');
assert.equal(layout.get('monica').y-layout.get('daniel').y,160);
const familyIds=['monica','daniel','jaima','angela','hermana','jaimita'];
const familyRight=Math.max(...familyIds.map(key=>layout.get(key).x));
assert(layout.get('amiga').x>familyRight,'La amistad queda fuera del bloque familiar');
assert(layout.get('otra-madre').x>layout.get('amiga').x+200,'Otra familia tiene su propio bloque');
for(const [id,a] of layout)for(const [other,b] of layout)if(id!==other)assert(Math.abs(a.x-b.x)>=200||Math.abs(a.y-b.y)>=196,'Sin superponer avatares y nombres');
const fixed=Family.layoutByAge([{key:'a',age:'20',position:{x:720,y:80,grid:1}},{key:'b',age:'50'}]);
assert.deepEqual(fixed.get('a'),{x:720,y:80},'La posición nueva elegida por el usuario prevalece sobre la edad');
const original=[{id:'a',relationshipPosition:{x:720,y:80,grid:1}},{id:'b',relationshipPosition:{x:0,y:0,grid:1}},{id:'c',relationshipPosition:{x:2400,y:80,grid:1}}];
const reset=Family.resetChangedPositions(original,[{...original[0],details:{relationships:[{targetId:'b',type:'Amistad'}]}},...original.slice(1)]);
assert(!reset[0].relationshipPosition&&!reset[1].relationshipPosition);assert.deepEqual(reset[2],original[2]);
const social=Family.layoutByAge(['centro','a','b','c','d','e'].map(key=>({key,age:''})),['a','b','c','d','e'].map(target=>({source:'centro',target,type:'Amistad'})));
assert([...social].filter(([key])=>key!=='centro').every(([,at])=>Math.hypot(at.x-social.get('centro').x,at.y-social.get('centro').y)<500),'Sin familia, la red social rodea al personaje');
const unknownFamily=Family.layoutByAge([{key:'p',age:''},{key:'h',age:''}],[{source:'p',target:'h',type:'Familia',parentId:'p'}]);
assert(unknownFamily.get('p').y<unknownFamily.get('h').y,'Sin edades, el parentesco determina las generaciones');
assert.equal(Family.groupsFor([{source:'p',target:'h',type:'Familia',parentId:'p'},{source:'q',target:'h',type:'Familia',parentId:'q'}],new Map([['p',{x:0,y:0}],['q',{x:240,y:0}],['h',{x:80,y:240}]])).length,1,'Dos progenitores se agrupan sin inventar una relación romántica');
const coParents=require('../character-tree-router.js').layout([], [{parents:['p','q'],children:['h'],child:'h',index:0,size:{width:50,height:25}}],new Map([['p',{x:0,y:0}],['q',{x:240,y:0}],['h',{x:80,y:240}]]));
assert.equal(coParents.branches[0].joint.y,0,'La unión de progenitores sin romance sale del nivel de los avatares');
const browserProfiles=profiles.map(profile=>profile.id==='angela'?{...profile,details:{...profile.details,relationships:[]}}:profile.id==='amiga'?{...profile,relationshipPosition:{x:-1440,y:-240,grid:1}}:profile);
const packed=Archive.stringify({name:'Familias y amistades',documentName:'Familias.plano',payload:{version:1,screenplay:S.create('Familias y amistades'),characterProfiles:browserProfiles,annotations:[],corrections:[],crew:{},proofreading:{enabled:false,dictionary:'',ignored:[]}}});
(async()=>{const browser=await launch(chromium,{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1520,height:1160}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.context().route('**/*',r=>/^https?:/.test(r.request().url())?r.abort():r.continue());
 await page.goto(pathToFileURL(path.join(__dirname,'..','index.html')).href);
 await page.locator('#file-input').setInputFiles({name:'Familias.plano',mimeType:'application/json',buffer:Buffer.from(packed)});
 await page.waitForFunction(()=>state.screenplay&&!state.busy);
 await page.locator('#editor-home').click();await page.locator('.script-card-open').click();await page.locator('#open-project-characters').click();await page.getByRole('tab',{name:'Árbol de relaciones'}).click();
 await page.locator('.relations-family-branch').first().waitFor();
 const at=id=>page.locator('[data-character-key="'+id+'"]').evaluate(node=>{const matrix=new DOMMatrixReadOnly(node.style.transform);return{x:matrix.m41+78,y:matrix.m42+40};});
 assert.equal((await at('amiga')).x,-1440);
 await page.locator('[data-relation-add]').click();
 const relation=page.getByRole('dialog',{name:'Añadir relación',exact:true});
 await relation.getByLabel('Personaje',{exact:true}).selectOption('angela');await relation.getByLabel('Relacionado con',{exact:true}).selectOption('amiga');
 await relation.getByLabel('Tipo de relación',{exact:true}).selectOption('Amistad');await relation.getByRole('button',{name:'Guardar relación'}).click();await relation.waitFor({state:'hidden'});
 assert.equal((await at('amiga')).x,layout.get('amiga').x,'Añadir un vínculo reorganiza la amistad automáticamente');
 assert.equal(await page.evaluate(()=>state.characterProfiles.find(p=>p.id==='amiga').relationshipPosition),undefined);
 assert.equal(await page.evaluate(()=>PlanoCharacterDetails.familyFor(state.characterProfiles,'amiga').length),0,'Amistad no crea parentescos');
 assert.equal(await page.locator('.relations-family-branch').count(),3);
 const paths=await page.locator('.relations-lines > path').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('d')));
 assert(paths.every(d=>!/[QCA]|NaN|Infinity/.test(d)),'Los vínculos son ortogonales');
 const avatarCollisions=await page.evaluate(()=>{
  const avatars=[...document.querySelectorAll('.relations-node')].map(node=>{const m=new DOMMatrixReadOnly(node.style.transform);return{x:m.m41+78,y:m.m42+40};});
  return [...document.querySelectorAll('.relations-lines>path')].some(path=>{
   const length=path.getTotalLength();if(!length)return false;
   for(let i=0;i<=200;i++){const p=path.getPointAtLength(length*i/200);if(avatars.some(a=>Math.hypot(a.x-p.x,a.y-p.y)<39))return true;}return false;
  });
 });assert(!avatarCollisions,'Las ramas no atraviesan otros avatares');
 const diagonal=paths.flatMap(d=>[...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(match=>({x:+match[1],y:+match[2],move:match[0][0]==='M'})));
 for(let i=1;i<diagonal.length;i++)if(!diagonal[i].move)assert(diagonal[i].x===diagonal[i-1].x||diagonal[i].y===diagonal[i-1].y);
 assert(await page.locator('.relations-canvas').evaluate(node=>getComputedStyle(node).backgroundImage!=='none'));
 assert(await page.locator('.relations-feeling-path').first().evaluate(node=>+getComputedStyle(node).opacity<.6));
 await page.screenshot({path:'tests/.output/arbol-cuadricula-familias-claro.png'});
 await page.evaluate(()=>PlanoAppearance.choose({mode:'dark'}));
 await page.screenshot({path:'tests/.output/arbol-cuadricula-familias-oscuro.png'});
 const before=await page.locator('.relations-lines').innerHTML();await page.locator('[data-zoom-in]').click();assert.equal(await page.locator('.relations-lines').innerHTML(),before,'El zoom no reorganiza las ramas');
 assert.deepEqual(errors,[]);console.log('OK: cuadrícula de 80px, filas de edad fijas, dos familias y amistad separada, barras de hermanos, conectores ortogonales, sentimientos transparentes y zoom estable.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
