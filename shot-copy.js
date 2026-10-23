/* Copias independientes de un plano completo, incluso con varios tramos. */
(function(root){
  'use strict';
  function capture(annotations,id){
    const source=annotations.find(item=>item.id===id);
    if(!source)return null;
    const parts=annotations.filter(item=>(item.shotId||item.id)===(source.shotId||source.id));
    return {base:structuredClone(source),parts:structuredClone(parts)};
  }
  function properties(copy,type){
    const data=structuredClone(copy.base);
    for(const key of ['id','shotId','shotName','shotOrder','createdAt','type','page','endPage','start','end','rects','text','labelPosition','labelPinned','lineLabel','scriptSelection'])delete data[key];
    if(type==='line'&&copy.base.type==='line'&&copy.base.lineLabel)data.lineLabel=structuredClone(copy.base.lineLabel);
    return data;
  }
  function nextName(annotations,next){
    let name=next(annotations.at(-1)?.shotName||'0').slice(0,120);
    const used=new Set(annotations.map(item=>item.shotName));
    for(let i=0;used.has(name)&&i<=annotations.length;i++)name=next(name).slice(0,120);
    if(used.has(name))throw new Error('No se pudo asignar un nombre nuevo al plano.');
    return name;
  }
  function line(copy,anchor,pageCount,viewport,coverage){
    let shape;
    if(copy.base.type==='line'){
      const {page,start,end,endPage}=copy.base;
      shape={type:'line',page,start:{...start},end:{...end},...(endPage?{endPage}:{})};
    }else{
      const parts=[...copy.parts].sort((a,b)=>a.page-b.page||a.rects[0].y-b.rects[0].y),first=parts[0],last=parts.at(-1);
      const x=Math.max(.02,Math.min(...first.rects.map(rect=>rect.x))-.025);
      const top=Math.min(...first.rects.map(rect=>rect.y)),bottom=Math.max(...last.rects.map(rect=>rect.y+rect.height));
      shape={type:'line',...coverage.fromEnds({page:first.page,x,y:top},{page:last.page,x,y:Math.min(1,Math.max(first.page===last.page?top+.025:0,bottom))})};
    }
    const length=coverage.endPage(shape)-shape.page+shape.end.y-shape.start.y;
    if(length>pageCount)throw new Error('Este plano necesita más páginas de las que tiene el documento.');
    const dx=(Math.max(shape.start.x,shape.end.x)>.95?-1:1)*18/viewport.width;
    const dy=anchor.page-shape.page+Math.max(anchor.y+.035,.03)-shape.start.y;
    return {type:'line',...coverage.moved(shape,dx,dy,pageCount)};
  }
  const api={capture,properties,nextName,line};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlanoShotCopy=api;
})(globalThis);
