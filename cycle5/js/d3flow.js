"use strict";
// Flow5 — производственный граф на D3 (force-directed): физика + перетаскивание + zoom/pan. Vanilla, без фреймворка.
const D3_STAGE = ["#ffb651","#ff7a3c","#8a96a8","#ff4700"];  // base / refine / craft / final
function renderD3(rootId, qty, host){
  host.innerHTML = "";
  if(typeof d3 === "undefined"){ host.appendChild(el("div","note","D3 не загружен")); return; }
  const m = flowModel(rootId, qty);
  const W = Math.max(700, host.clientWidth || 900);
  const nodes = m.items.map((id)=>({ id, stage:m.stageOf(id), name:ty(id).name, q:m.qOf(id), lo:m.leftOf(id), img:"icons/"+id+".png" }));
  const links = m.edges.map((e)=>({ source:e.from, target:e.to, co:e.co }));
  const colCnt = {}; nodes.forEach((n)=>{ colCnt[n.stage]=(colCnt[n.stage]||0)+1; });
  const maxCol = Math.max(1, ...Object.values(colCnt)), ROWGAP = 72;
  const H = Math.max(560, maxCol*ROWGAP + 90);   // высота под самую длинную колонку → viewBox впишет всё во вьюпорт (без клипа)

  const wrap = el("div","d3wrap"); host.appendChild(wrap);
  const svg = d3.select(wrap).append("svg").attr("width","100%").attr("height","100%").attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet");
  const defs = svg.append("defs");
  [["d3arr","#6b6456"],["d3arrco","#ff7a3c"]].forEach(([id,c])=>{
    defs.append("marker").attr("id",id).attr("viewBox","0 0 8 8").attr("refX",7).attr("refY",4).attr("markerWidth",6).attr("markerHeight",6).attr("orient","auto")
      .append("path").attr("d","M0,0 L8,4 L0,8 Z").attr("fill",c);
  });
  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([0.2,2.5]).on("zoom",(ev)=> g.attr("transform", ev.transform)));

  // фоновые полосы этапов: база / рефайн / крафт / финал (X нод привязан к своей полосе)
  const SN = LANG==="en" ? ["Base resources","Refining","Crafting","Final"] : ["Базовое сырьё","Переработка","Крафт","Финал"];
  const bandW = (W-160)/4, cx = (s)=> 80 + s*bandW + bandW/2;
  const bandsG = g.append("g");
  [0,1,2,3].forEach((s)=>{ if(!nodes.some((n)=>n.stage===s)) return;
    bandsG.append("rect").attr("x", 80+s*bandW+4).attr("y",0).attr("width",bandW-8).attr("height",H).attr("fill",D3_STAGE[s]).attr("opacity",0.06);
    bandsG.append("text").attr("x", 80+s*bandW+bandW/2).attr("y",18).attr("text-anchor","middle").attr("fill","#ff4700").attr("font-family","monospace").attr("font-size",12).attr("font-weight",700).text(SN[s].toUpperCase());
  });

  const link = g.append("g").selectAll("path").data(links).join("path").attr("class","d3edge")
    .attr("fill","none").attr("stroke",(d)=>d.co?"#ff7a3c":"#4a463c").attr("stroke-width",1.5)
    .attr("stroke-dasharray",(d)=>d.co?"5 4":null).attr("marker-end",(d)=>d.co?"url(#d3arrco)":"url(#d3arr)");

  const node = g.append("g").selectAll("g").data(nodes).join("g").style("cursor","grab");
  node.append("foreignObject").attr("width",170).attr("height",54).attr("x",-85).attr("y",-27)
    .html((d)=> `<div xmlns="http://www.w3.org/1999/xhtml" class="flownode ${flowCardCls(d.id, rootId)}" style="position:static;width:170px;height:54px">${flowCardHTML(d.id, m.qOf, m.leftOf)}</div>`);
  node.append("title").text((d)=>d.name);

  // без charge (он и устраивал хаос): жёстко притягиваем X к колонке этапа, Y к ряду; связи — несиловые
  const rowIdx = {}; const seenRow = {};
  nodes.slice().sort((a,b)=> b.q-a.q).forEach((n)=>{ seenRow[n.stage]=(seenRow[n.stage]||0); rowIdx[n.id]=seenRow[n.stage]++; });
  const rowY = (d)=> H/2 + (rowIdx[d.id] - (colCnt[d.stage]-1)/2) * ROWGAP;
  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d)=>d.id).strength(0.02))
    .force("x", d3.forceX((d)=> cx(d.stage)).strength(1))
    .force("y", d3.forceY(rowY).strength(0.85))
    .force("collide", d3.forceCollide(40))
    .on("tick", ticked);

  function ticked(){
    link.attr("d",(d)=>{ const x1=d.source.x, y1=d.source.y; let x2=d.target.x, y2=d.target.y;
      const dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy)||1; x2-=dx/L*44; y2-=dy/L*22;   // отступ от центра ноды (для стрелки)
      const mx=(x1+x2)/2; return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`; });
    node.attr("transform",(d)=>`translate(${d.x},${d.y})`);
  }
  // подсветка цепочки по клику (нода + предки + потомки); остальное приглушаем; БЕЗ перехода
  const up={}, down={};
  m.edges.forEach((e)=>{ (down[e.from]=down[e.from]||[]).push(e.to); (up[e.to]=up[e.to]||[]).push(e.from); });
  let hiId=null;
  const clearHi=()=>{ hiId=null; node.select(".flownode").classed("hi",false).classed("dim",false); link.classed("hi",false).classed("dim",false); };
  const highlight=(id)=>{ if(hiId===id){ clearHi(); return; } hiId=id; const keep=new Set([id]);
    const reach=(s,adj)=>{ const st=[s]; while(st.length){ const x=st.pop(); (adj[x]||[]).forEach((y)=>{ if(!keep.has(y)){ keep.add(y); st.push(y); } }); } };
    reach(id,up); reach(id,down);
    node.select(".flownode").classed("hi",(d)=>keep.has(d.id)).classed("dim",(d)=>!keep.has(d.id));
    link.classed("hi",(l)=>keep.has(l.source.id)&&keep.has(l.target.id)).classed("dim",(l)=>!(keep.has(l.source.id)&&keep.has(l.target.id)));
  };
  svg.on("click",(ev)=>{ if(!(ev.target.closest && ev.target.closest(".flownode"))) clearHi(); });
  let dmoved=false, dsx=0, dsy=0;
  node.call(d3.drag()
    .on("start",(ev,d)=>{ dmoved=false; dsx=ev.x; dsy=ev.y; if(!ev.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
    .on("drag",(ev,d)=>{ if(Math.abs(ev.x-dsx)+Math.abs(ev.y-dsy)>4) dmoved=true; d.fx=ev.x; d.fy=ev.y; })
    .on("end",(ev,d)=>{ if(!ev.active) sim.alphaTarget(0); d.fx=null; d.fy=null; if(!dmoved) highlight(d.id); }));
  wrap.appendChild(flowFs(wrap));
}
