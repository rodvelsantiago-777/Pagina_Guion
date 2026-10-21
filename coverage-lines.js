/* Una sola línea/una sola ficha; sus tramos se proyectan sobre cada página. */
(function(root){
  'use strict';
  const endPage = item => item.endPage ?? item.page;
  const unit = point => point.page - 1 + point.y;
  function fromEnds(start,end){
    if(start.page>end.page)[start,end]=[end,start];
    if(end.page===start.page+1&&start.y===1&&end.y===0)end={...end,page:start.page,y:1};
    return {page:start.page,...(end.page!==start.page?{endPage:end.page}:{}),start:{x:start.x,y:start.y},end:{x:end.x,y:end.y}};
  }
  function part(item,page){
    if(item.type!=='line'||endPage(item)===item.page)return item.page===page?item:null;
    if(page<item.page||page>endPage(item))return null;
    const a=item.page-1+item.start.y,b=endPage(item)-1+item.end.y;
    if(b<=a)return null;
    const x=y=>item.start.x+(item.end.x-item.start.x)*(y-a)/(b-a);
    const top=page===item.page?item.start.y:0,bottom=page===endPage(item)?item.end.y:1;
    return {...item,page,start:{x:x(page-1+top),y:top},end:{x:x(page-1+bottom),y:bottom},continuesBefore:page>item.page,continuesAfter:page<endPage(item)};
  }
  const onPage=(items,page)=>items.map(item=>part(item,page)).filter(Boolean);
  function pages(item){return Array.from({length:(item.type==='line'?endPage(item):item.page)-item.page+1},(_,i)=>item.page+i);}
  function moved(item,dx,dy,pageCount){
    const a={page:item.page,...item.start},b={page:endPage(item),...item.end};
    dx=Math.max(-Math.min(a.x,b.x),Math.min(1-Math.max(a.x,b.x),dx));
    dy=Math.max(-Math.min(unit(a),unit(b)),Math.min(pageCount-Math.max(unit(a),unit(b)),dy));
    const shift=p=>{const y=unit(p)+dy,page=Math.min(pageCount,Math.floor(y)+1);return {page,x:p.x+dx,y:y-page+1};};
    return fromEnds(shift(a),shift(b));
  }
  const api={endPage,unit,fromEnds,part,onPage,pages,moved};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlanoCoverage=api;
})(globalThis);
