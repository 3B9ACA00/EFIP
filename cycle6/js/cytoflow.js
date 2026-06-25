"use strict";
// Flow2 — производственный граф на Cytoscape.js (vanilla-вендор). Этапы = compound-ноды (subflows).
const CYTO_STAGE = { en:["Base resources","Refining","Crafting","Final"], ru:["Базовое сырьё","Переработка","Крафт","Финал"] };
function renderCyto(rootId, qty, host, opts){
  host.innerHTML = "";
  if(typeof cytoscape === "undefined"){ host.appendChild(el("div","note","Cytoscape не загружен")); return; }
  const compound = !opts || opts.compound !== false;          // Flow2: subflow-этапы; Flow6: без них
  const layoutName = (opts && opts.layout) || "preset";       // Flow2: preset(мои позиции); Flow6: dagre(авто)
  if(layoutName==="dagre" && typeof cytoscapeDagre!=="undefined" && !renderCyto._dagre){ try{ cytoscape.use(cytoscapeDagre); renderCyto._dagre=true; }catch(e){} }
  const m = flowModel(rootId, qty);
  const sName = (s)=> (LANG==="en"?CYTO_STAGE.en:CYTO_STAGE.ru)[s];
  const COLW=150, ROWH=104, GAP=80;
  const els = [];
  if(compound) [0,1,2,3].forEach((s)=>{ if(m.byStage[s].length) els.push({ group:"nodes", data:{ id:"st"+s, label:sName(s) }, classes:"stage" }); });
  m.items.forEach((id)=>{
    const data = { id:"n"+id, cls: flowCardCls(id, rootId), html: flowCardHTML(id, m.qOf, m.leftOf) };
    if(compound) data.parent = "st"+m.stageOf(id);
    const en = { group:"nodes", data, classes: flowCardCls(id, rootId) };
    if(layoutName==="preset") en.position = { x: m.colOf[id]*COLW + m.stageOf(id)*GAP, y: m.yRow[id]*ROWH };
    els.push(en);
  });
  m.edges.forEach((e,i)=> els.push({ group:"edges", data:{ id:"e"+i, source:"n"+e.from, target:"n"+e.to }, classes:e.co?"co":"" }));

  const cont = el("div","cytowrap"); host.appendChild(cont);
  const cy = cytoscape({
    container: cont, elements: els, wheelSensitivity:0.25, minZoom:0.15, maxZoom:2.5,
    layout: layoutName==="dagre" ? { name:"dagre", rankDir:"LR", nodeSep:16, rankSep:80, fit:true, padding:30 } : { name:"preset", fit:true, padding:30 },
    style:[
      { selector:"node.stage", style:{ "background-color":"#ff7a3c","background-opacity":0.05,"border-width":1,"border-color":"#34302a","border-style":"dashed","shape":"round-rectangle","padding":22,
        "label":"data(label)","text-valign":"top","text-halign":"center","text-margin-y":4,"color":"#ff4700","font-family":"monospace","font-size":13,"font-weight":700 } },
      { selector:"node:childless", style:{ "width":170,"height":54,"shape":"rectangle","background-opacity":0,"border-width":0 } },
      { selector:"edge", style:{ "width":1.5,"line-color":"#4a463c","target-arrow-color":"#6b6456","target-arrow-shape":"triangle","arrow-scale":0.9,"curve-style":"bezier" } },
      { selector:"edge.co", style:{ "line-color":"#ff7a3c","line-style":"dashed","target-arrow-color":"#ff7a3c" } },
      { selector:".hl", style:{ "border-color":"#ff4700","border-width":3,"line-color":"#ff4700","target-arrow-color":"#ff4700","z-index":99 } },
      { selector:".faded", style:{ "opacity":0.18 } },
    ],
  });
  cy.fit(undefined, 30);
  try{ window._cyFlow = cy; }catch(e){}   // debug-хэндл
  // единые HTML-карточки .flownode (как в Flow/Flow5) через node-html-label
  if(typeof cy.nodeHtmlLabel === "function") cy.nodeHtmlLabel([{ query:"node[html]", halign:"center", valign:"center", halignBox:"center", valignBox:"center",
    tpl:(d)=> `<div class="flownode ${d.cls}${d.hi?" hi":""}${d.dim?" dim":""}" style="pointer-events:none">${d.html}</div>` }]);
  // клик по ноде = подсветка цепочки (предки+потомки), остальное приглушить; карточки реагируют через data(hi/dim)
  cy.on("tap","node",(ev)=>{
    const n = ev.target; if(n.isParent()) return;
    const keep = new Set(n.predecessors().union(n.successors()).union(n).map((e)=>e.id()));
    cy.nodes().forEach((nd)=>{ if(nd.isParent()) return; const on=keep.has(nd.id()); nd.data("hi",on); nd.data("dim",!on); });
    cy.edges().forEach((e)=>{ const on=keep.has(e.source().id())&&keep.has(e.target().id()); e.toggleClass("hl",on); e.toggleClass("faded",!on); });
  });
  cy.on("tap",(ev)=>{ if(ev.target===cy){ cy.nodes().forEach((nd)=>{ nd.removeData("hi"); nd.removeData("dim"); }); cy.edges().removeClass("hl faded"); } });
  cont.appendChild(flowFs(cont));
  try{ new ResizeObserver(()=> cy.resize()).observe(cont); }catch(e){}   // фулскрин = больше области, ноды того же размера
}
