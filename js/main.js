// ── каталог ──────────────────────────────────────────
// ── категории (1-й сайдбар) ──────────────────────────
function renderCats(){
  const host = $("#cats"); if(!host) return; host.innerHTML = "";
  const counts = {}; for(const t of DATA.types) counts[t.cat] = (counts[t.cat]||0)+1;
  Object.keys(counts).sort((a,b)=>catRank(a)-catRank(b)).forEach((c)=>{
    const it = el("div","catrow"+(c===selectedCat?" sel":"")); it.dataset.cat = c;
    const dot = el("span","catdot"); dot.style.background = CAT_COLOR[c] || CAT_COLOR.Unknown;
    it.appendChild(dot);
    it.appendChild(el("span","catname", esc(c)));
    it.appendChild(el("span","catcnt", String(counts[c])));
    it.onclick = ()=> selectCat(c);
    host.appendChild(it);
  });
}

// ── предметы выбранной категории (2-й сайдбар) ──────
function renderItems(){
  const host = $("#list"); if(!host) return; host.innerHTML = "";
  host.className = "list " + (viewMode==="tile" ? "tile" : "rows");
  const gq = ($("#gsearch") ? $("#gsearch").value : "").trim().toLowerCase();
  const lq = ($("#search")  ? $("#search").value  : "").trim().toLowerCase();
  const onlyCraft = $("#onlyCraft") ? $("#onlyCraft").checked : false;
  let items = DATA.types.filter((t)=>{
    if(onlyCraft && !isCraftable(t.id)) return false;
    if(gq) return t.name.toLowerCase().includes(gq) || String(t.id)===gq;  // глоб. поиск перекрывает категорию
    if(selectedCat && t.cat!==selectedCat) return false;
    if(lq) return t.name.toLowerCase().includes(lq) || String(t.id)===lq;
    return true;
  });
  items.sort((a,b)=>{ const r=catRank(a.cat)-catRank(b.cat); return r || a.name.localeCompare(b.name); });
  const frag = document.createDocumentFragment();
  for(const t of items){
    let node;
    if(viewMode==="tile"){
      node = el("div","tilecard"+(isCraftable(t.id)?" craftable":"")); node.dataset.id = t.id;
      node.appendChild(icon(t.id,44));
      node.appendChild(el("div","tnm", esc(t.name)));
    } else {
      node = el("div","row"); node.dataset.id = t.id;
      node.appendChild(icon(t.id,28));
      const c = el("div"); c.style.minWidth="0";
      c.appendChild(el("div","nm", esc(t.name)));
      c.appendChild(el("div","meta", esc(t.grp||t.cat)));
      node.appendChild(c);
      if(isCraftable(t.id)) node.appendChild(el("span","tag craft",i18n("крафт")));
    }
    if(t.id===selected) node.classList.add("sel");
    node.onclick = ()=> showDetail(t.id);
    frag.appendChild(node);
  }
  host.appendChild(frag);
  const st = $("#stat"); if(st) st.textContent = i18n("{n} из {m}", {n:items.length, m:DATA.types.length});
}

function updateViewBtns(){
  const a=$("#viewTile"), b=$("#viewList"); if(a) a.classList.toggle("on", viewMode==="tile"); if(b) b.classList.toggle("on", viewMode==="list");
}

// ── хлебные крошки ──────────────────────────────────
function renderCrumbs(){
  const c = $("#crumbs"); if(!c) return; c.innerHTML = "";
  const add = (label, onClick, cur)=>{
    if(c.children.length) c.appendChild(el("span","crumbsep","›"));
    const node = el("span","crumb"+(cur?" cur":"")); node.textContent = label;
    if(onClick && !cur) node.onclick = onClick;
    c.appendChild(node);
  };
  add("Industry", ()=>{ selectedCat=null; if($("#gsearch")) $("#gsearch").value=""; if($("#search")) $("#search").value=""; selected=null; renderCats(); renderItems(); renderCrumbs(); }, false);
  const gq = ($("#gsearch") ? $("#gsearch").value : "").trim();
  if(gq){ add(i18n("Поиск «{q}»", {q:gq}), null, true); return; }
  const cat = (selected!=null && T[selected]) ? ty(selected).cat : selectedCat;
  if(cat) add(cat, ()=>selectCat(cat), selected==null);
  if(selected!=null && T[selected]) add(ty(selected).name, null, true);
}

// ── выбор категории / синхронизация сайдбара ────────
function selectCat(c){
  selectedCat = c;
  if($("#gsearch")) $("#gsearch").value = "";
  if($("#search"))  $("#search").value  = "";
  renderCats(); renderItems(); renderCrumbs();
}
function highlightItem(id){
  for(const r of document.querySelectorAll("#list [data-id]")) r.classList.toggle("sel", +r.dataset.id===id);
}
function syncSidebarTo(id){
  const gq = $("#gsearch") ? $("#gsearch").value.trim() : "";
  if(!gq){ const c = ty(id).cat; if(c && c!==selectedCat){ selectedCat = c; renderCats(); renderItems(); } }
  highlightItem(id);
  renderCrumbs();
}

// ── старт ────────────────────────────────────────────
async function boot(){
  try{ DATA = await (await fetch("data.json", {cache:"no-cache"})).json(); }
  catch(e){
    document.body.innerHTML = i18n('<p style="padding:30px;color:#f0556b">Не удалось загрузить data.json. Запусти через serve.bat (http://localhost:8099).</p>');
    return;
  }
  for(const t of DATA.types) T[t.id]=t;
  for(const r of DATA.recipes){
    for(const o of r.out) (byOut[o.id] ||= []).push(r);
    for(const i of r.inp) (byInput[i.id] ||= []).push(r);
  }
  if(DATA.facilities) for(const f of Object.keys(DATA.facilities)) facChecks[+f] = true;
  for(const t of DATA.types){ if(t.slot && modsBySlot[t.slot]) modsBySlot[t.slot].push(t.id); }
  rebuildAvail();
  try{ viewMode = localStorage.getItem("ef_view") || "tile"; }catch(e){}
  const cats = Array.from(new Set(DATA.types.map(t=>t.cat))).sort((a,b)=>catRank(a)-catRank(b));
  selectedCat = cats[0] || null;
  renderCats(); updateViewBtns(); renderItems(); renderCrumbs();

  $("#gsearch").oninput = ()=>{ renderItems(); renderCrumbs(); };
  $("#search").oninput  = renderItems;
  $("#onlyCraft").onchange = renderItems;
  const setView = (m)=>{ viewMode=m; try{ localStorage.setItem("ef_view",m); }catch(e){} updateViewBtns(); renderItems(); };
  $("#viewTile").onclick = ()=> setView("tile");
  $("#viewList").onclick = ()=> setView("list");
  const cmp = $("#cmpShips"); if(cmp) cmp.onclick = ()=>{ selectedCat="Ship"; if($("#gsearch")) $("#gsearch").value=""; renderCats(); renderItems(); shipsCompare(); renderCrumbs(); };
  applyStatic();
  document.querySelectorAll("#langsw [data-lang]").forEach((b)=> b.onclick = ()=> setLang(b.dataset.lang));

  function parseH(){
    const h=(location.hash||"").replace("#","");
    if(h==="ships") return {ships:true};
    if(h==="cycle6") return {cycle6:true};
    const lm=h.match(/^list(?:=(.*))?$/); if(lm) return {list:true, raw:lm[1]};   // raw=undefined для «#list» без «=»
    const f=h.match(/^fit-(\d+)$/); if(f) return {fit:+f[1]};
    const m=h.match(/^(\d+)(?:x(\d+))?$/);
    return m ? {id:+m[1], qty:m[2]?+m[2]:1} : {};
  }
  // список крафта: бэкап из localStorage (для счётчика навигации); хеш #list перекроет в dispatch
  try{ craftList = (JSON.parse(localStorage.getItem("ef_craftlist")||"[]")||[]).filter((x)=> x && T[x.id]); }catch(e){}
  const nl = $("#navlist"); if(nl) nl.onclick = ()=>{ location.hash = "#"+listHash(); };
  const c6b = $("#navc6"); if(c6b) c6b.onclick = ()=> showCycle6();
  const c5b = $("#navc5"); if(c5b) c5b.onclick = ()=>{ const def=(selected!=null&&T[selected])?selected:(DATA.recipes.flatMap((r)=>r.out.map((o)=>o.id)).find((id)=>ty(id).cat==="Ship")); if(def) showDetail(def); };
  updateListNav();
  const ph = parseH();
  if(ph.cycle6){ showCycle6(); }
  else if(ph.list){ enterList(ph.raw); showList(); }
  else if(ph.ships){ selectedCat="Ship"; renderCats(); renderItems(); shipsCompare(); renderCrumbs(); }
  else if(ph.fit && T[ph.fit]){ showFit(ph.fit); }
  else if(ph.id && T[ph.id]){ showDetail(ph.id, ph.qty); }
  else {
    const ship = DATA.recipes.flatMap(r=>r.out.map(o=>o.id)).find(id=>ty(id).cat==="Ship");
    if(ship) showDetail(ship);
  }
  window.addEventListener("hashchange", ()=>{
    const p = parseH();
    if(p.cycle6){ showCycle6(); }
    else if(p.list){ enterList(p.raw); showList(); }
    else if(p.ships){ selectedCat="Ship"; renderCats(); renderItems(); shipsCompare(); renderCrumbs(); }
    else if(p.fit && T[p.fit]){ if(!(selected===p.fit && fitMode)) showFit(p.fit); }
    else if(p.id && T[p.id]){ if(!(selected===p.id && !fitMode)) showDetail(p.id, p.qty); }
  });
}
boot();
