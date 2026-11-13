const assert=require('node:assert/strict'),S=require('../screenplay.js'),L=require('../screenplay-links.js');
const p=(kind,text,id)=>({type:'paragraph',attrs:{kind,id},content:[{type:'text',text}]}),script=S.create('La transferencia',{name:'Ana',email:'ana@example.invalid'});script.doc.content=[p('scene','INT. CASA - DÍA','scene'),p('action','La mujer abre la puerta.','action')];
const map=L.geometry(script),first=map.rows[0],last=map.rows[1];
const original=[{id:'line',type:'line',page:first.page,shotName:'PA',color:'#e8b83f',start:{x:.82,y:first.y-.01},end:{x:.82,y:last.y+last.height},description:'Una ficha completa',note:'Nota',lineLabel:{side:'right',t:.2}},{id:'highlight',type:'highlight',page:last.page,shotName:'PB',color:'#d94f54',rects:[{x:last.x,y:last.y,width:7*7.2/612,height:last.height}],text:'La mujer'}];
const linked=L.attach(original,script);assert(linked.every(n=>n.coverageAnchor));assert.deepEqual(L.reflow(linked,script),linked,'No altera una geometría que ya corresponde al texto');
const changed=structuredClone(script);changed.revision++;changed.doc.content.unshift(p('action','El prólogo. '.repeat(700),'prologue'));
const flowed=L.reflow(linked,changed);assert(flowed.find(n=>n.id==='line').page>first.page);assert.equal(flowed.find(n=>n.id==='line').description,'Una ficha completa');assert.deepEqual(flowed.find(n=>n.id==='line').lineLabel,original[0].lineLabel);assert.equal(flowed.find(n=>n.id==='highlight').text,'La muje');assert.equal(flowed.find(n=>n.id==='highlight').color,'#d94f54');
const removed=structuredClone(changed);removed.revision++;removed.doc.content=removed.doc.content.filter(n=>n.attrs.id!=='action');assert(L.reflow(flowed,removed).find(n=>n.shotName==='PB').anchorReview,'Conserva la ficha y avisa cuando el texto se elimina');
const inside=structuredClone(script);inside.revision++;inside.doc.content[1].content[0].text='La protagonista abre la puerta.';const rebased=L.rebase(linked,script.doc,inside.doc);assert(rebased.find(n=>n.shotName==='PB').coverageAnchor.review,'Una migración de versiones antiguas marca un rango reescrito');
const after=structuredClone(script.doc);after.content[1].content[0].text='Antes. '+S.plain(after.content[1]);const threshold=L.blocks(script.doc)[1].pos+1,transaction={mapping:{mapResult:(position,bias)=>({pos:position>=threshold?position+7:position,deletedAcross:false})}};const mapped=L.mapEdits(linked,script.doc,after,[transaction]);assert.equal(mapped[1].coverageAnchor.from.offset,7);assert.equal(mapped[1].coverageAnchor.to.offset,14);
const full={...script,annotations:original,crew:{director:'Privado'},corrections:[{text:'Privado'}]},portable=JSON.parse(S.portable(full));assert.deepEqual(Object.keys(portable).sort(),['format','screenplay','version']);assert(!('annotations'in portable.screenplay));const imported=S.importPortable(JSON.stringify(portable));assert.notEqual(imported.id,script.id);assert.deepEqual(imported.doc,script.doc);assert.deepEqual(imported.authors,script.authors);assert.equal(imported.revision,0);assert.throws(()=>S.importPortable(JSON.stringify({version:1,screenplay:script,annotations:original})));assert.throws(()=>S.importPortable('bad'));
const source=S.fromPdf([{width:612,height:792,lines:[{text:'INT. CASA - DÍA',x:.17,y:.13,width:.5,height:.015},{text:'Una acción.',x:.17,y:.22,width:.3,height:.015}]}],'Convertido',{name:'Ana',email:'ana@example.invalid'});assert.equal(source.sourceLayout.rows.length,2);assert.equal(L.geometry(source).pages.length,1);assert.equal(S.importPortable(S.portable(source)).sourceLayout.revision,0);assert.throws(()=>S.fromPdf([{width:612,height:792,lines:[]}],'Escaneado',{}),/OCR/);
console.log('OK: vínculos estables, desplazamiento a otras páginas, datos de plano conservados, rangos borrados, transacciones, compatibilidad de archivos antiguos de escritura, autores y geometría inicial de PDF.');

const reuse=L.editMapper(script.doc,after,[transaction]);const saved=structuredClone(linked);assert.deepEqual(reuse(linked),mapped);assert.deepEqual(reuse(linked),mapped,'El mismo índice sirve para varias instantáneas');assert.deepEqual(linked,saved,'El mapeo no modifica los planos del historial original');

let mappingCalls=0;
const counted={mapping:{mapResult(...args){mappingCalls++;return transaction.mapping.mapResult(...args);}}};
const shared=L.editMapper(script.doc,after,[counted],{reuse:true});
assert.deepEqual(shared(linked),mapped);
const firstPass=mappingCalls;
assert.deepEqual(shared(structuredClone(linked)),mapped);
assert.equal(mappingCalls,firstPass,'Deshacer conserva los vínculos idénticos sin volver a proyectarlos');
const resized=structuredClone(linked);
resized[1].coverageAnchor.to.offset--;
assert.deepEqual(shared(resized),L.mapEdits(resized,script.doc,after,[transaction]),'Un resalte previo con el mismo identificador conserva su tamaño');
assert(mappingCalls>firstPass);
