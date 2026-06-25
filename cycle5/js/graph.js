"use strict";
// ── flow-граф производства (vanilla SVG + HTML-карточки, без фреймворка) ──
// Слои слева→направо по глубине: руда → материалы → компоненты → финал.
// Рёбра = вход→выход активного рецепта; мульти-выход переработки = ветвление (побочка пунктиром).
const SVGNS = "http://www.w3.org/2000/svg";
const svgEl = (t)=> document.createElementNS(SVGNS, t);

// общая модель графа (этапы/колонки/рёбра) — для всех flow-вкладок (custom / Cytoscape / Drawflow)
function flowModel(rootId, qty){
  const p = plan(rootId, qty); const dmemo = {};
  const stageOf = (id)=> id===rootId ? 3 : (!recipeFor(id) ? 0 : (isRefineStep(id) ? 1 : 2));
  const qOf = (id)=> id===rootId ? qty : (recipeFor(id) ? (p.demand[id]||0) : (p.raw[id]||0));
  const leftOf = (id)=>{ const lo=Math.round(p.byprod[id]||0); return (lo>0 && lo>0.01*(p.demand[id]||0)) ? lo : 0; };
  const byStage = {0:[],1:[],2:[],3:[]}; p.items.forEach((id)=> byStage[stageOf(id)].push(id));
  let col=0; const colOf={};
  for(let s=0;s<=3;s++){ const ns=byStage[s]; if(!ns.length) continue;
    const ds=[...new Set(ns.map((id)=>nodeDepth(id,dmemo)))].sort((a,b)=>a-b); const dc={}; ds.forEach((d)=>dc[d]=col++);
    ns.forEach((id)=>colOf[id]=dc[nodeDepth(id,dmemo)]); }
  const colGroups={}; p.items.forEach((id)=>{ (colGroups[colOf[id]]=colGroups[colOf[id]]||[]).push(id); });
  const yRow={}; for(const k in colGroups) colGroups[k].sort((a,b)=>qOf(b)-qOf(a)).forEach((id,i)=> yRow[id]=i);
  const edges=[]; const seen=new Set(); const iset=new Set(p.items);
  for(const x of p.items){ const runs=p.runsOf[x]||0, r=recipeFor(x); if(!r||!runs) continue;
    for(const i of r.inp) for(const o of r.out){ if(!iset.has(i.id)||!iset.has(o.id)) continue;   // только связи между существующими нодами
      const k=i.id+">"+o.id; if(seen.has(k)) continue; seen.add(k); edges.push({from:i.id,to:o.id,co:o.id!==x}); } }
  return { p, items:p.items, edges, byStage, stageOf, colOf, yRow, qOf, leftOf };
}
// единая карточка ноды (HTML) — один вид для Flow / Flow5(foreignObject) / Flow6(html-label)
function flowCardCls(id, rootId){ return id===rootId ? "final" : (!recipeFor(id) ? "raw" : (isRefineStep(id) ? "refine" : "craft")); }
function flowCardHTML(id, qOf, leftOf){
  const lo = leftOf ? leftOf(id) : 0;
  return `<span class="ic" style="width:36px;height:36px;flex:0 0 36px"><img src="icons/${id}.png" width="36" height="36" loading="lazy" onerror="this.style.visibility='hidden'"></span>`
    + `<div class="fnbody"><div class="fnname">${esc(ty(id).name)}</div>`
    + `<div class="fnqty">${num(qOf(id))}×${lo?` <span class="fnleft">+${num(lo)}</span>`:""}</div></div>`;
}
// кнопка «на весь экран» (оверлей) для любого flow-контейнера
function flowFs(container){
  const b = el("button","sec-btn mini2 flowfs", i18n("⛶ На весь экран"));
  b.onclick = ()=>{ if(document.fullscreenElement) document.exitFullscreen(); else if(container.requestFullscreen) container.requestFullscreen(); };
  return b;
}

function renderGraph(rootId, qty, host){
  _lastGraph = { id: rootId, qty, host };
  host.innerHTML = "";
  const p = plan(rootId, qty);
  const nodes = p.items.slice();
  if(!nodes.length){ host.appendChild(el("div","note", i18n("без рецепта"))); return; }
  const dmemo = {};
  const qOf = (id)=> id===rootId ? qty : (recipeFor(id) ? (p.demand[id]||0) : (p.raw[id]||0));  // сколько НУЖНО/копать
  const leftOf = (id)=>{ const lo=Math.round(p.byprod[id]||0); return (lo>0 && lo > 0.01*(p.demand[id]||0)) ? lo : 0; };  // остаток (избыток побочки)

  // рёбра вход→выход (дедуп); primary=целевой выход, иначе побочка
  const seen = new Set(), edges = [];
  for(const x of p.items){
    const runs = p.runsOf[x]||0, r = recipeFor(x);
    if(!r || !runs) continue;
    for(const i of r.inp) for(const o of r.out){
      const k = i.id+">"+o.id; if(seen.has(k)) continue; seen.add(k);
      edges.push({ from:i.id, to:o.id, co:o.id!==x });
    }
  }
  const nodeEl = {}, edgeEls = [];   // ссылки для интерактива (drag/пан/подсветка)
  // ── ЭТАПЫ (визуальные полосы): 0 базовое сырьё · 1 переработка · 2 крафт · 3 финал ──
  const stageOf = (id)=> id===rootId ? 3 : (!recipeFor(id) ? 0 : (isRefineStep(id) ? 1 : 2));
  const byStage = {0:[],1:[],2:[],3:[]};
  nodes.forEach((id)=> byStage[stageOf(id)].push(id));
  // колонки: сперва по этапу, внутри этапа — по глубине (многошаговый рефайн/крафт = подколонки)
  let col = 0; const colOf = {}, stageRange = {};
  for(let s=0; s<=3; s++){ const ns = byStage[s]; if(!ns.length){ stageRange[s]=null; continue; }
    const depths = [...new Set(ns.map((id)=>nodeDepth(id,dmemo)))].sort((a,b)=>a-b);
    const start = col, dc = {}; depths.forEach((d)=> dc[d]=col++);
    ns.forEach((id)=> colOf[id]=dc[nodeDepth(id,dmemo)]);
    stageRange[s] = [start, col-1];
  }
  const maxCol = col-1;
  const COLW=246, ROWH=98, NODEW=172, NODEH=56, PADX=18, PADY=42, GAP=60;
  const xOf = (id)=> PADX + colOf[id]*COLW + stageOf(id)*GAP;
  const colGroups = {}; nodes.forEach((id)=>{ (colGroups[colOf[id]]=colGroups[colOf[id]]||[]).push(id); });
  const pos = {};
  for(const k in colGroups) colGroups[k].sort((a,b)=> qOf(b)-qOf(a)).forEach((id,i)=>{ pos[id]={ x:xOf(id), y:PADY+i*ROWH }; });
  const W = PADX*2 + maxCol*COLW + 3*GAP + NODEW;
  const H = PADY + Math.max(1, ...Object.values(colGroups).map((c)=>c.length))*ROWH + 16;

  const wrap = el("div","flowwrap"); wrap.style.width=W+"px"; wrap.style.height=H+"px";
  // полосы этапов (фон + подпись) — позади всего
  [[0,"Базовое сырьё"],[1,"Переработка"],[2,"Крафт"],[3,"Финал"]].forEach(([s,label])=>{
    const r = stageRange[s]; if(!r) return;
    const lx = PADX + r[0]*COLW + s*GAP - 9, rx = PADX + r[1]*COLW + s*GAP + NODEW + 9;
    const band = el("div","flowband s"+s); band.style.left=lx+"px"; band.style.width=(rx-lx)+"px"; band.style.height=H+"px";
    band.appendChild(el("div","flowbandh", i18n(label)));
    wrap.appendChild(band);
  });
  // связи + стрелки
  const svg = svgEl("svg"); svg.setAttribute("class","flowsvg"); svg.setAttribute("width",W); svg.setAttribute("height",H);
  const defs = svgEl("defs");
  const mk = (mid,color)=>{ const m=svgEl("marker"); m.setAttribute("id",mid); m.setAttribute("viewBox","0 0 8 8");
    m.setAttribute("refX","6"); m.setAttribute("refY","4"); m.setAttribute("markerWidth","6"); m.setAttribute("markerHeight","6"); m.setAttribute("orient","auto");
    const pa=svgEl("path"); pa.setAttribute("d","M0,0 L8,4 L0,8 Z"); pa.setAttribute("fill",color); m.appendChild(pa); return m; };
  defs.appendChild(mk("flowarr","#6b6456")); defs.appendChild(mk("flowarrco","#ff7a3c"));
  svg.appendChild(defs);
  for(const e of edges){
    const a=pos[e.from], b=pos[e.to]; if(!a||!b) continue;
    const x1=a.x+NODEW, y1=a.y+NODEH/2, x2=b.x-7, y2=b.y+NODEH/2, mx=(x1+x2)/2;
    const path=svgEl("path");
    path.setAttribute("d", `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    path.setAttribute("class", "flowedge"+(e.co?" co":""));
    path.setAttribute("marker-end", e.co?"url(#flowarrco)":"url(#flowarr)");
    edgeEls.push({ el:path, from:e.from, to:e.to });
    svg.appendChild(path);
  }
  wrap.appendChild(svg);
  // ноды
  for(const id of nodes){
    const isRaw = !recipeFor(id), isFin = id===rootId;
    const cls = isFin ? "final" : (isRaw ? "raw" : (isRefineStep(id) ? "refine" : "craft"));
    const n = el("div","flownode "+cls);
    n.style.left=pos[id].x+"px"; n.style.top=pos[id].y+"px"; n.style.width=NODEW+"px"; n.style.height=NODEH+"px";
    n.appendChild(icon(id,36));
    const bd = el("div","fnbody");
    bd.appendChild(el("div","fnname", esc(ty(id).name)));
    const fq = el("div","fnqty"); fq.appendChild(document.createTextNode(num(qOf(id))+"×"));
    const lo = leftOf(id);
    if(lo){ const ls=el("span","fnleft"," +"+num(lo)); ls.title=i18n("остаток (бонус-побочка)"); fq.appendChild(ls); }
    bd.appendChild(fq);
    n.appendChild(bd);
    n.title = ty(id).name;
    nodeEl[id] = n;
    wrap.appendChild(n);
  }
  // легенда + кнопка «на весь экран» (кнопка — оверлеем внутри канваса, чтобы работала и в фулскрине)
  const scroll = el("div","flowscroll"); scroll.appendChild(wrap);
  const fsBtn = el("button","sec-btn mini2 flowfs", i18n("⛶ На весь экран"));
  fsBtn.onclick = ()=>{ if(document.fullscreenElement) document.exitFullscreen(); else if(scroll.requestFullscreen) scroll.requestFullscreen(); };
  scroll.appendChild(fsBtn);
  const lg = el("div","flowlegend");
  lg.appendChild(el("span","lgtxt", i18n("<b>—</b> поток &nbsp; <b style='color:var(--violet)'>--</b> побочка &nbsp; <span class='lgr'></span> руда &nbsp; <span class='lgf'></span> финал")));
  host.appendChild(lg); host.appendChild(scroll);

  // ── ИНТЕРАКТИВ ──
  const drawEdge = (ed)=>{ const a=pos[ed.from], b=pos[ed.to]; if(!a||!b) return;
    const x1=a.x+NODEW, y1=a.y+NODEH/2, x2=b.x-7, y2=b.y+NODEH/2, mx=(x1+x2)/2;
    ed.el.setAttribute("d", `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`); };
  // подсветка цепочки (через ноду: вверх до базового сырья + вниз до финала); остальное приглушаем
  const up = {}, down = {};
  edges.forEach((e)=>{ (down[e.from]=down[e.from]||[]).push(e.to); (up[e.to]=up[e.to]||[]).push(e.from); });
  let hiId = null;
  const clearHi = ()=>{ hiId=null; nodes.forEach((id)=> nodeEl[id].classList.remove("hi","dim")); edgeEls.forEach((ed)=> ed.el.classList.remove("hi","dim")); };
  const highlight = (id)=>{
    if(hiId===id){ clearHi(); return; }
    hiId = id; const keep = new Set([id]);
    const reach = (start, adj)=>{ const st=[start]; while(st.length){ const x=st.pop(); (adj[x]||[]).forEach((y)=>{ if(!keep.has(y)){ keep.add(y); st.push(y); } }); } };
    reach(id, up); reach(id, down);
    nodes.forEach((nid)=>{ const on=keep.has(nid); nodeEl[nid].classList.toggle("hi",on); nodeEl[nid].classList.toggle("dim",!on); });
    edgeEls.forEach((ed)=>{ const on=keep.has(ed.from)&&keep.has(ed.to); ed.el.classList.toggle("hi",on); ed.el.classList.toggle("dim",!on); });
  };
  // drag ноды — ТОЛЬКО по вертикали (X фиксирован); клик без сдвига = подсветка
  nodes.forEach((id)=>{
    const n = nodeEl[id];
    n.addEventListener("mousedown",(e)=>{
      e.preventDefault(); e.stopPropagation();
      const sx=e.clientX, sy=e.clientY, oy=pos[id].y; let moved=false;
      const mv=(ev)=>{ const dy=ev.clientY-sy; if(Math.abs(ev.clientX-sx)+Math.abs(dy)>4) moved=true;
        pos[id].y = Math.max(6, Math.min(H-NODEH-6, oy+dy));
        n.style.top=pos[id].y+"px";
        edgeEls.forEach((ed)=>{ if(ed.from===id||ed.to===id) drawEdge(ed); }); };
      const upE=()=>{ document.removeEventListener("mousemove",mv); document.removeEventListener("mouseup",upE); if(!moved) highlight(id); };
      document.addEventListener("mousemove",mv); document.addEventListener("mouseup",upE);
    });
  });
  // пан канваса — ЛКМ по пустому месту; transform-translate => свободно во ВСЕ стороны (в т.ч. фулскрин)
  let panX=0, panY=0; const applyPan=()=> wrap.style.transform = `translate(${panX}px,${panY}px)`;
  wrap.addEventListener("mousedown",(e)=>{
    if(e.target.closest(".flownode")) return;
    e.preventDefault();
    const sx=e.clientX, sy=e.clientY, ox=panX, oy=panY; let moved=false;
    scroll.classList.add("grabbing");
    const mv=(ev)=>{ const dx=ev.clientX-sx, dy=ev.clientY-sy; if(Math.abs(dx)+Math.abs(dy)>3) moved=true; panX=ox+dx; panY=oy+dy; applyPan(); };
    const upE=()=>{ document.removeEventListener("mousemove",mv); document.removeEventListener("mouseup",upE); scroll.classList.remove("grabbing"); if(!moved && hiId) clearHi(); };
    document.addEventListener("mousemove",mv); document.addEventListener("mouseup",upE);
  });
}
