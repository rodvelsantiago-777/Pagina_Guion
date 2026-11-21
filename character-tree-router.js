/* Conectores ortogonales y barras de hermanos. No cambia parentescos ni posiciones. */
(function(root){
 'use strict';
 const box=at=>({left:at.x-88,right:at.x+88,top:at.y-76,bottom:at.y+128});
 const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 const path=points=>'M'+points.map(p=>p.x+' '+p.y).join('L');
 function hits(a,b,rect){
  return overlap({left:Math.min(a.x,b.x)-1,right:Math.max(a.x,b.x)+1,top:Math.min(a.y,b.y)-1,bottom:Math.max(a.y,b.y)+1},rect);
 }
 function labelFor(points,size,obstacles,labels){
  let best;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],length=Math.hypot(a.x-b.x,a.y-b.y);
   for(const t of [.5,.3,.7,.15,.85]){
    const at={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    const rect={left:at.x-size.width/2-5,right:at.x+size.width/2+5,top:at.y-size.height/2-5,bottom:at.y+size.height/2+5};
    const cost=obstacles.filter(other=>overlap(rect,other)).length*10000+labels.filter(other=>overlap(rect,other)).length*7000+
     Math.max(0,(a.y===b.y?size.width:size.height)+12-length)*30+Math.abs(t-.5)*10+100/(length+1);
    if(!best||cost<best.cost)best={...at,rect,cost};
   }
  }
  labels.push(best.rect);return best;
 }
 function layout(edges,branches,positions,{preview=false}={}){
  const result={edges:[],branches:[]},boxes=[...positions].map(([id,at])=>({id,...box(at)})),labels=[],used=[];
  const segmentKey=(a,b)=>a.x+','+a.y+':'+b.x+','+b.y;
  function route(start,end,skip=new Set(),offset=0){
   const x=(start.x+end.x)/2+offset,y=(start.y+end.y)/2+offset;
   const candidates=[[start,end]];
   if(start.x!==end.x&&start.y!==end.y)candidates.length=0;
   candidates.push([start,{x,y:start.y},{x,y:end.y},end], [start,{x:start.x,y},{x:end.x,y},end]);
   for(const rail of [Math.min(start.x,end.x)-112-offset,Math.max(start.x,end.x)+112+offset])candidates.push([start,{x:rail,y:start.y},{x:rail,y:end.y},end]);
   for(const rail of [Math.min(start.y,end.y)-92-offset,Math.max(start.y,end.y)+148+offset])candidates.push([start,{x:start.x,y:rail},{x:end.x,y:rail},end]);
   if(preview)return candidates[0];
   let best;
   for(const points of candidates){
    let cost=(points.length-2)*20;
    for(let i=1;i<points.length;i++){
     const a=points[i-1],b=points[i];cost+=Math.hypot(a.x-b.x,a.y-b.y);
     for(const rect of boxes)if(!skip.has(rect.id)&&hits(a,b,rect))cost+=20000;
     for(const rect of labels)if(hits(a,b,rect))cost+=4000;
     for(const other of used)if(segmentKey(a,b)===other)cost+=2000;
    }
    if(!best||cost<best.cost)best={points,cost};
   }
   for(let i=1;i<best.points.length;i++)used.push(segmentKey(best.points[i-1],best.points[i]));
   return best.points;
  }
  // Primero las parejas; cada unión tiene su propio punto de descendencia.
  const ordered=[...edges].sort((a,b)=>Number(b.link.type==='Romance')-Number(a.link.type==='Romance'));
  function routeEdge(edge){
   const {link}=edge,a=positions.get(link.source),b=positions.get(link.target);
   if(edge.hidden){result.edges[edge.index]={path:'',labelPosition:{x:0,y:0}};return;}
   const skip=new Set([link.source,link.target]);let points;
   if(link.parentId){
    const p=positions.get(link.parentId),c=positions.get(link.parentId===link.source?link.target:link.source);
    points=route({x:p.x,y:p.y+126},{x:c.x,y:c.y-44},skip,edge.offset*18);
   }else{
    const direction=b.x>=a.x?1:-1;
    points=route({x:a.x+direction*42,y:a.y},{x:b.x-direction*42,y:b.y},skip,edge.offset*18);
   }
   const labelPosition=labelFor(points,edge.size,preview?[]:boxes,preview?[]:labels);
   const center=points.length===2?{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}:
    points[1].x===points[2].x?{x:points[1].x,y:Math.max(points[1].y,points[2].y)}:{x:(points[1].x+points[2].x)/2,y:points[1].y};
   result.edges[edge.index]={path:path(points),labelPosition,joint:center};
  }
  for(const edge of ordered)if(['Familia','Romance'].includes(edge.link.type))routeEdge(edge);
  const groups=new Map();
  for(const branch of branches){const key=JSON.stringify(branch.parents);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(branch);}
  for(const group of groups.values()){
   const parents=group[0].parents,children=group.map(branch=>branch.child),points=parents.map(id=>positions.get(id));
   const couple=parents.length===2&&edges.find(edge=>!edge.link.parentId&&edge.link.type==='Romance'&&parents.includes(edge.link.source)&&parents.includes(edge.link.target));
   const joint=couple?{...result.edges[couple.index].joint}:{x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,y:Math.max(...points.map(p=>p.y))};
   const childPoints=children.map(id=>positions.get(id));
   const busY=Math.min(...childPoints.map(p=>p.y))-112;
   let connector='';
   if(!couple){
    const xs=[...new Set(points.map(p=>p.x))].sort((a,b)=>a-b);
    if(xs.length>2){const gaps=xs.slice(1).map((x,i)=>({width:x-xs[i],x:(x+xs[i])/2})).sort((a,b)=>b.width-a.width);joint.x=gaps[0].x;}
    for(const p of points){
     const direction=joint.x>=p.x?1:-1;
     connector+=path(route({x:p.x+direction*42,y:p.y},joint,new Set(parents)));
    }
   }
   const trunk=route(joint,{x:joint.x,y:busY},new Set([...parents,...children]));
   const left=Math.min(joint.x,...childPoints.map(p=>p.x)),right=Math.max(joint.x,...childPoints.map(p=>p.x));
   connector+=path(trunk)+path([{x:left,y:busY},{x:right,y:busY}]);
   group.forEach((branch,index)=>{
    const c=positions.get(branch.child),drop=route({x:c.x,y:busY},{x:c.x,y:c.y-44},new Set([branch.child]));
    const labelPosition=labelFor(drop,branch.size,preview?[]:boxes,preview?[]:labels);
    result.branches[branch.index]={path:(index===0?connector:'')+path(drop),joint,labelPosition,first:index===0};
   });
  }
  // Las amistades y otros vínculos se adaptan al árbol, nunca al revés.
  for(const edge of ordered)if(!['Familia','Romance'].includes(edge.link.type))routeEdge(edge);
  return result;
 }
 const api={layout};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoTreeRouter=api;
})(globalThis);
