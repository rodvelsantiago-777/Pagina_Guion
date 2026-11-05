/* Vínculos de cobertura a texto editable. No guarda páginas PDF ni copias del guion. */
(function(root){
 'use strict';
 const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay;
 const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
 const textHash=text=>{let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(16).padStart(8,'0');};
 const docText=doc=>doc.content.map(node=>'\n'+S.plain(node)+'\n').join('');
 function blocks(doc){let pos=0;return doc.content.map(node=>{const text=S.plain(node),item={id:node.attrs.id,text,pos,size:text.length+2};pos+=item.size;return item;});}
 function absolute(point,doc){const block=blocks(doc).find(block=>block.id===point.id);return block?block.pos+1+clamp(point.offset,0,block.text.length):null;}
 function pointAt(pos,doc){const list=blocks(doc),block=list.find(block=>pos<=block.pos+block.text.length+1)||list.at(-1);return{id:block.id,offset:clamp(pos-block.pos-1,0,block.text.length)};}
 function validAnchor(anchor){
  if(!anchor||anchor.version!==1||typeof anchor.key!=='string'||anchor.key.length>120)throw Error('Hay vínculos de cobertura inválidos.');
  for(const p of [anchor.from,anchor.to,...(anchor.orphan?[anchor.orphan.from,anchor.orphan.to]:[])])if(!p||typeof p.id!=='string'||!/^[-\w]{1,80}$/.test(p.id)||!Number.isSafeInteger(p.offset)||p.offset<0||p.offset>220000)throw Error('Hay referencias de texto inválidas.');
  if(anchor.orphan&&!/^[a-f0-9]{8}$/.test(anchor.orphan.hash))throw Error('Hay vínculos eliminados inválidos.');
  return{version:1,key:anchor.key,from:{...anchor.from},to:{...anchor.to},startDy:clamp(Number(anchor.startDy)||0,-1,1),endDy:clamp(Number(anchor.endDy)||0,-1,1),...(Number.isSafeInteger(anchor.layoutRevision)&&anchor.layoutRevision>=0?{layoutRevision:anchor.layoutRevision}:{}),...(anchor.review?{review:true}:{}),...(anchor.orphan?{orphan:{from:{...anchor.orphan.from},to:{...anchor.orphan.to},hash:anchor.orphan.hash,review:Boolean(anchor.orphan.review)}}:{})};
 }
 function geometry(script){
  const source=script.sourceLayout,byId=new Map(blocks(script.doc).map(block=>[block.id,block]));
  if(source?.revision===script.revision)return{pages:source.pages,index:byId,rows:source.rows.filter(row=>row.id).flatMap(row=>{const block=byId.get(row.id),offset=row.from||0,end=row.to??block.text.length;return(row.parts||[[0,end-offset,row.x,row.width]]).map(part=>({...row,blockId:row.id,from:offset+part[0],to:offset+part[1],x:part[2],width:part[3],text:block.text.slice(offset+part[0],offset+part[1]),pos:block.pos+1+offset+part[0]}));})};
  let top=252+S.wrap(script.title||'Sin título',60).length*12+48;
  for(const author of script.authors.filter(a=>a.name.trim()))top+=S.wrap(author.name,60).length*12+6;
  const contact=[];for(const author of script.authors){if(!author.email&&!author.phone&&!author.contact)continue;for(const text of [author.name,author.email,author.phone,author.contact].filter(s=>s.trim()))contact.push(...S.wrap(text,60));contact.push('');}if(contact.at(-1)==='')contact.pop();
  let titlePages=1,contactTop=Math.max(top+36,720-contact.length*12);for(const line of contact){if(contactTop>708){titlePages++;contactTop=72;}contactTop+=12;}
  const flow=S.layout(script.doc),pages=Array.from({length:titlePages+flow.pageCount},()=>({width:612,height:792}));
  return{pages,index:byId,rows:flow.blocks.flatMap(block=>block.lines.map(line=>({blockId:block.id,page:titlePages+line.page+1,from:line.from,to:line.to,text:line.text,pos:block.pos+1+line.from,x:(S.types[line.kind].right?540-line.text.trimEnd().length*7.2:S.types[line.kind].left+(line.prefix?.length||0)*7.2)/612,y:(73.2+line.row*12)/792,width:line.text.length*7.2/612,height:12/792})))};
 }
 function nearest(map,page,y){return map.rows.reduce((best,row)=>{const distance=Math.abs(row.page-page)*2+Math.abs(row.y-y);return !best||distance<best.distance?{row,distance}:best;},null)?.row;}
 const endpoint=(row,offset)=>({id:row.blockId,offset:clamp(offset,row.from,row.to)});
 function selectionAnchor(parts,map,key){
  const hits=[];
  for(const part of parts)for(const rect of part.rects)for(const row of map.rows){if(row.page!==part.page||row.y+row.height<rect.y||row.y>rect.y+rect.height||row.x+row.width<rect.x||row.x>rect.x+rect.width)continue;const char=row.width/Math.max(1,row.to-row.from),from=row.from+Math.floor((rect.x-row.x)/char+.15),to=row.from+Math.ceil((rect.x+rect.width-row.x)/char-.15);hits.push({row,from:clamp(from,row.from,row.to),to:clamp(to,row.from,row.to)});}
  if(!hits.length)return null;hits.sort((a,b)=>a.row.pos+a.from-a.row.from-b.row.pos-b.from+b.row.from);const first=hits[0],last=hits.at(-1);return{version:1,key,from:endpoint(first.row,first.from),to:endpoint(last.row,last.to),startDy:0,endDy:0};
 }
 function attach(items,script,force=false){
  if((!force||force instanceof Set&&!force.size)&&items.every(item=>item.coverageAnchor))return structuredClone(items);
  const map=geometry(script);
  return items.map(item=>{
   const note=structuredClone(item),forced=force instanceof Set?force.has(note.id):force;if(note.coverageAnchor&&!forced)return note;
   if(note.type==='line'){
    const a=nearest(map,note.page,note.start.y),b=nearest(map,note.endPage||note.page,note.end.y);
    if(a&&b){const ends=row=>map.rows.filter(r=>r.blockId===row.blockId&&r.page===row.page&&r.y===row.y);const first=ends(a)[0],last=ends(b).at(-1);note.coverageAnchor={version:1,key:note.id,from:endpoint(first,first.from),to:endpoint(last,last.to),startDy:note.start.y-a.y,endDy:note.end.y-b.y};}
   }else{const anchor=selectionAnchor([{page:note.page,rects:note.rects}],map,note.id);if(anchor)note.coverageAnchor=anchor;else delete note.coverageAnchor;}
   if(note.coverageAnchor)note.coverageAnchor.layoutRevision=script.revision;
   if(note.scriptSelection?.length){const anchor=selectionAnchor(note.scriptSelection,map,note.id+'-text');if(anchor)note.scriptAnchor=anchor;else delete note.scriptAnchor;}
   return note;
  });
 }
 // Un único índice por transacción sirve también para todos los estados del historial.
 function editMapper(before,after,transactions){
  const old=new Map(blocks(before).map(block=>[block.id,block])),next=blocks(after),nextIds=new Map(next.map(block=>[block.id,block]));let beforeText,afterText;
  const position=point=>{const block=old.get(point.id);return block?block.pos+1+clamp(point.offset,0,block.text.length):null;};
  const point=pos=>{let low=0,high=next.length-1;while(low<high){const mid=(low+high)>>1;if(pos<=next[mid].pos+next[mid].text.length+1)high=mid;else low=mid+1;}const block=next[low];return{id:block.id,offset:clamp(pos-block.pos-1,0,block.text.length)};};
  function mapped(anchor){if(!anchor)return anchor;const clean=validAnchor(anchor);
   if(clean.orphan){const a=nextIds.get(clean.orphan.from.id),b=nextIds.get(clean.orphan.to.id);if(a&&b&&clean.orphan.from.offset<=a.text.length&&clean.orphan.to.offset<=b.text.length){afterText??=docText(after);const restored=afterText.slice(a.pos+1+clean.orphan.from.offset,b.pos+1+clean.orphan.to.offset);if(textHash(restored)===clean.orphan.hash){clean.from={...clean.orphan.from};clean.to={...clean.orphan.to};const review=clean.orphan.review;delete clean.orphan;if(!review)delete clean.review;}}return clean;}
   let from=position(clean.from),to=position(clean.to);if(from===null||to===null)return{...clean,review:true};const originalFrom=from,originalTo=to,wasReview=Boolean(clean.review);
   for(const tr of transactions){const a=tr.mapping.mapResult(from,1),b=tr.mapping.mapResult(to,-1);from=a.pos;to=b.pos;if(a.deletedAcross&&b.deletedAcross||to<from)clean.review=true;}
   if(to<=from){beforeText??=docText(before);clean.orphan={from:{...clean.from},to:{...clean.to},hash:textHash(beforeText.slice(originalFrom,originalTo)),review:wasReview};clean.review=true;}clean.from=point(from);clean.to=point(Math.max(from,to));return clean;
  }
  return items=>items.map(item=>({...item,...(item.coverageAnchor?{coverageAnchor:mapped(item.coverageAnchor)}:{}),...(item.scriptAnchor?{scriptAnchor:mapped(item.scriptAnchor)}:{})}));
 }
 function mapEdits(items,before,after,transactions){return items.length?editMapper(before,after,transactions)(items):[];}
 function rebase(items,before,after){
  const old=blocks(before),next=blocks(after),byId=new Map(next.map(block=>[block.id,block]));
  function move(anchor){if(!anchor)return anchor;const clean=validAnchor(anchor);
   for(const [key,bias]of [['from',1],['to',-1]]){const point=clean[key],a=old.find(block=>block.id===point.id);let b=byId.get(point.id);if(!a||!b){clean.review=true;const index=old.indexOf(a),near=old.slice(0,index).reverse().find(block=>byId.has(block.id));b=near?byId.get(near.id):next[0];clean[key]={id:b.id,offset:near?b.text.length:0};continue;}
    let left=0,right=0;while(left<a.text.length&&left<b.text.length&&a.text[left]===b.text[left])left++;while(right<a.text.length-left&&right<b.text.length-left&&a.text[a.text.length-1-right]===b.text[b.text.length-1-right])right++;
    if(a.text!==b.text&&left+right===0)clean.review=true;
    let offset=point.offset;if(offset>left&&offset<a.text.length-right){offset=bias>0?b.text.length-right:left;clean.review=true;}else if(offset>=a.text.length-right&&a.text!==b.text)offset+=b.text.length-a.text.length;clean[key]={id:b.id,offset:clamp(offset,0,b.text.length)};
   }return clean;
  }
  return items.map(item=>({...item,...(item.coverageAnchor?{coverageAnchor:move(item.coverageAnchor)}:{}),...(item.scriptAnchor?{scriptAnchor:move(item.scriptAnchor)}:{})}));
 }
 function ranges(anchor,script,map){
  const position=point=>{const block=map.index?.get(point.id);return block?block.pos+1+clamp(point.offset,0,block.text.length):absolute(point,script.doc);},from=position(anchor.from),to=position(anchor.to);if(from===null||to===null||to<=from)return[];
  return map.rows.flatMap(row=>{const a=Math.max(from,row.pos),b=Math.min(to,row.pos+row.to-row.from);if(b<=a)return[];const char=row.width/Math.max(1,row.to-row.from);return[{page:row.page,text:row.text.slice(a-row.pos,b-row.pos),row,rect:{x:clamp(row.x+(a-row.pos)*char),y:clamp(row.y),width:clamp((b-a)*char,0,1-clamp(row.x+(a-row.pos)*char)),height:clamp(row.height,0,1-row.y)}}];});
 }
 function reflow(items,script){
  const map=geometry(script),done=new Set(),result=[];
  const group=segments=>{const pages=new Map();for(const segment of segments){if(!pages.has(segment.page))pages.set(segment.page,{page:segment.page,text:'',rects:[]});const part=pages.get(segment.page);part.text+=(part.text?'\n':'')+segment.text;part.rects.push(segment.rect);}return[...pages.values()];};
  for(const item of items){const anchor=item.coverageAnchor;if(!anchor){const copy=structuredClone(item);copy.page=clamp(copy.page,1,map.pages.length);if(copy.endPage)copy.endPage=clamp(copy.endPage,copy.page,map.pages.length);result.push(copy);continue;}
   if(anchor.layoutRevision===script.revision){result.push(structuredClone(item));continue;}
   const key=item.type+':'+anchor.key;if(done.has(key))continue;done.add(key);const segments=ranges(anchor,script,map),copy=structuredClone(item);copy.coverageAnchor.layoutRevision=script.revision;delete copy.anchorReview;
   if(!segments.length){copy.anchorReview=true;copy.page=clamp(copy.page,1,map.pages.length);if(copy.endPage)copy.endPage=clamp(copy.endPage,copy.page,map.pages.length);result.push(copy);continue;}
   if(anchor.review)copy.anchorReview=true;
   const parts=group(segments),first=segments[0],last=segments.at(-1),oldY=item.type==='line'?item.start.y:Math.min(...item.rects.map(rect=>rect.y));
   if(copy.labelPosition)copy.labelPosition.y=clamp(copy.labelPosition.y+first.rect.y-oldY,-1,2);
   if(item.type==='line'){
    copy.page=first.page;delete copy.endPage;if(last.page!==first.page)copy.endPage=last.page;copy.start.y=clamp(first.row.y+anchor.startDy);copy.end.y=clamp(last.row.y+anchor.endDy);if(copy.page===(copy.endPage||copy.page)&&copy.end.y<=copy.start.y)copy.end.y=clamp(copy.start.y+last.row.height);
    const text=copy.scriptAnchor?ranges(copy.scriptAnchor,script,map):segments;copy.scriptSelection=group(text);result.push(copy);
   }else for(const [i,part]of parts.entries())result.push({...copy,id:i?`${anchor.key.slice(0,100)}-part-${i}`:anchor.key,page:part.page,rects:part.rects,text:part.text});
  }return result;
 }
 const api={blocks,absolute,pointAt,validAnchor,geometry,attach,mapEdits,editMapper,rebase,reflow,selectionAnchor,ranges};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoScreenplayLinks=api;
})(globalThis);
