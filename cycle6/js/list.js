// ── Раздел «Список крафта»: агрегированный расчёт ресурсов на список предметов ──
// Источник истины — URL-хеш (#list=87161.84180x10), + бэкап в localStorage.
// Движок ПЕРЕИСПОЛЬЗУЕТСЯ через ВИРТУАЛЬНЫЙ КОРЕНЬ (LIST_ROOT): синтетический рецепт,
// чьи входы = предметы списка → renderPlan(LIST_ROOT, 1) даёт сводный план (руда/рефайн/
// крафт/склад/итоги), volume-оптимизированный, с зачётом склада. См. plan() / renderPlan().

function saveCraftList(){ try{ localStorage.setItem("ef_craftlist", JSON.stringify(craftList)); }catch(e){} }
function listCount(){ return craftList.reduce((s,x)=>s+(x.qty>0?1:0),0); }

// компактная сериализация в URL: #list=id[xqty].id[xqty]…  (qty опускается при 1)
function listHash(){
  const toks = craftList.filter((x)=>x.qty>0).map((x)=> (x.off?"-":"") + (x.qty>1 ? (x.id+"x"+x.qty) : String(x.id)));
  return "list" + (toks.length ? "="+toks.join(".") : "");
}
function listActiveCount(){ return craftList.reduce((s,x)=>s+((x.qty>0 && !x.off)?1:0),0); }   // учитываемых в крафте (для итогов плана)
function toggleListOff(id){ const e=craftList.find((x)=>x.id===id); if(!e) return; e.off=!e.off; saveCraftList(); showList(); }
function parseCraftList(raw){
  return String(raw||"").split(".").map((tok)=>{
    const m = tok.match(/^(-)?(\d+)(?:x(\d+))?$/); if(!m) return null;   // «-» префикс = выключен (не учитывать в крафте)
    const id = +m[2]; if(!T[id]) return null;
    return { id, qty: Math.max(1, m[3] ? +m[3] : 1), off: !!m[1] };
  }).filter(Boolean);
}
// войти в список из URL/permalink: raw==null (хеш «#list» без «=») → берём текущий/localStorage; иначе парсим
function enterList(raw){
  if(raw == null){
    if(!craftList.length){ try{ craftList = (JSON.parse(localStorage.getItem("ef_craftlist")||"[]")||[]).filter((x)=> x && T[x.id]); }catch(e){} }
  } else craftList = parseCraftList(raw);
}

function updateListNav(){
  const a = document.getElementById("navlist");
  if(a){ const n = listCount(); a.textContent = i18n("📋 Список крафтов") + (n ? (" ("+n+")") : ""); a.classList.toggle("active", !!listMode); }
  // циклы в шапке: Cycle 6 активен только в своём (пустом) разделе
  const e5 = document.getElementById("navc5"), e6 = document.getElementById("navc6");
  if(e5) e5.classList.toggle("active", !cycle6Mode);
  if(e6) e6.classList.toggle("active", !!cycle6Mode);
}

// ── мутации списка ──
function addToList(id, qty){
  qty = Math.max(1, qty||1);
  const e = craftList.find((x)=>x.id===id);
  if(e) e.qty += qty; else craftList.push({ id, qty });
  saveCraftList(); updateListNav();
  if(listMode) showList();
}
function removeFromList(id){ craftList = craftList.filter((x)=>x.id!==id); saveCraftList(); showList(); }
function setListQty(id, qty){
  const e = craftList.find((x)=>x.id===id); if(!e) return;
  e.qty = Math.max(1, qty||1);
  saveCraftList();
  history.replaceState(null, "", "#"+listHash());
  const inp = document.querySelector('.listtbl tr[data-id="'+id+'"] .lqin');   // синхронизируем поле (если степпер)
  if(inp && (parseInt(inp.value)||0)!==e.qty) inp.value = String(e.qty);
  rerenderListPlan();   // план — дебаунсом, без перерисовки таблицы (не дёргается)
}
let _listPlanT = null;
function rerenderListPlan(){
  updateListNav();
  if(_listPlanT) clearTimeout(_listPlanT);
  _listPlanT = setTimeout(()=>{ const host=document.getElementById("listplanhost"); if(!host) return; buildListRoot(); renderPlan(LIST_ROOT, 1, host); }, 220);
}
function clearList(){ confirmModal(i18n("Очистить весь список крафта?"), ()=>{ craftList = []; saveCraftList(); showList(); }); }

// синтетический рецепт: входы = предметы списка → renderPlan сводит весь BOM
function buildListRoot(){
  const items = craftList.filter((x)=>x.qty>0 && !x.off).map((x)=>({ id:x.id, q:x.qty }));   // выключенные (off) в расчёт не идут
  T[LIST_ROOT] = { id:LIST_ROOT, name:i18n("📋 Список крафта"), cat:"Unknown", grp:"", vol:0, mass:0, icon:0 };
  byOut[LIST_ROOT] = items.length ? [{ bp:LIST_ROOT, inp:items, out:[{ id:LIST_ROOT, q:1 }], rt:0, fac:[] }] : [];
  resetCost();
}

// ── рендер раздела ──
function showList(){
  listMode = true; cycle6Mode = false; selected = null; fitMode = false;
  const wantHash = "#" + listHash();
  if(location.hash !== wantHash) history.replaceState(null, "", wantHash);   // permalink: URL всегда отражает список
  saveCraftList(); updateListNav(); renderCrumbs();

  const d = $("#detail"); const sc = d.scrollTop||0; d.innerHTML = "";

  // — шапка —
  const head = el("div","dhead listhead");
  const ht = el("div");
  ht.appendChild(el("div","dname", i18n("📋 Список крафта")));
  ht.appendChild(el("div","dmeta", i18n("предметов: {n}", { n:listCount() })));
  head.appendChild(ht);
  const share = el("button","sec-btn mini2 linkbtn", i18n("🔗 Поделиться"));
  share.onclick = ()=>{ navigator.clipboard.writeText(location.href).then(()=>{ share.textContent=i18n("✓ скопировано"); setTimeout(()=>share.textContent=i18n("🔗 Поделиться"),1600); }).catch(()=>{}); };
  head.appendChild(share);
  if(craftList.length){ const clr = el("button","sec-btn mini2", i18n("Очистить всё")); clr.onclick = clearList; head.appendChild(clr); }
  d.appendChild(head);

  if(!craftList.length){
    d.appendChild(el("div","empty", i18n("Список пуст — открой предмет в каталоге и нажми «➕ В список».")));
    d.scrollTop = sc; return;
  }

  // — предметы списка: таблица с ФИКСИРОВАННОЙ сеткой (colgroup+table-layout:fixed → не прыгает), зебра —
  const tbl = el("table","listtbl");
  const cg = el("colgroup"); ["34px","auto","128px","62px"].forEach((w)=>{ const c=el("col"); c.style.width=w; cg.appendChild(c); }); tbl.appendChild(cg);
  const thd = el("thead"); thd.appendChild(el("tr", null,
    "<th class='lnum'>#</th><th class='lname'>"+esc(i18n("Предмет"))+"</th><th class='lqty'>"+esc(i18n("Кол-во"))+"</th><th class='lact'></th>"));
  tbl.appendChild(thd);
  const tb = el("tbody");
  craftList.filter((x)=>x.qty>0).forEach((x, i)=>{
    const off = !!x.off;
    const tr = el("tr","litem"+(i%2?" zeb":"")+(off?" off":"")); tr.dataset.id = x.id;
    tr.appendChild(el("td","lnum", String(i+1)));
    const nmtd = el("td","lname");
    const ic = el("span","lic"); ic.onclick=()=>showDetail(x.id); ic.appendChild(icon(x.id,28)); nmtd.appendChild(ic);
    const nm = el("span","lnm", esc(ty(x.id).name)); nm.onclick=()=>showDetail(x.id); nmtd.appendChild(nm);
    if(!isCraftable(x.id)) nmtd.appendChild(el("span","tag raw"," "+i18n("сырьё")));
    tr.appendChild(nmtd);
    const qtd = el("td","lqty");
    const qb = el("div","qstep");
    const inp = el("input","lqin"); inp.type="number"; inp.min="1"; inp.value=String(x.qty); inp.onchange=()=>setListQty(x.id, parseInt(inp.value)||1);
    const dec = el("button","lstep"); dec.type="button"; dec.textContent="−"; dec.title=i18n("Меньше"); dec.onclick=()=>setListQty(x.id, (parseInt(inp.value)||1)-1);
    const inc = el("button","lstep"); inc.type="button"; inc.textContent="+"; inc.title=i18n("Больше"); inc.onclick=()=>setListQty(x.id, (parseInt(inp.value)||1)+1);
    qb.appendChild(dec); qb.appendChild(inp); qb.appendChild(inc); qtd.appendChild(qb); tr.appendChild(qtd);
    const atd = el("td","lact");
    const eye = el("button","sxb eye"+(off?" eyeoff":"")); eye.innerHTML=ICO_EYE; eye.title=off?i18n("Учитывать в крафте"):i18n("Не учитывать в крафте"); eye.onclick=()=>toggleListOff(x.id);
    const del = el("button","sxb del"); del.innerHTML=ICO_DEL; del.title=i18n("Удалить"); del.onclick=()=>removeFromList(x.id);
    atd.appendChild(eye); atd.appendChild(del); tr.appendChild(atd);
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  d.appendChild(tbl);

  // — агрегированный план: переиспользуем renderPlan через виртуальный корень —
  buildListRoot();
  const planHost = el("div","listplan"); planHost.id="listplanhost"; d.appendChild(planHost);
  renderPlan(LIST_ROOT, 1, planHost);
  d.scrollTop = sc;
}

// ── Cycle 6 — пустой раздел (заглушка) ──
function showCycle6(){
  listMode=false; cycle6Mode=true; selected=null; fitMode=false;
  if(location.hash!=="#cycle6") history.replaceState(null,"","#cycle6");
  const d=$("#detail"); d.innerHTML="";
  renderShipyard(d);
  updateListNav(); renderCrumbs();
}
// мини-сетка cells (footprint модуля / часть базы)
function cellGrid(cells, cls){
  const g=el("div","cg"+(cls?" "+cls:""));
  if(!cells||!cells.length) return g;
  const xs=cells.map(c=>c.x), ys=cells.map(c=>c.y);
  const minx=Math.min.apply(null,xs), miny=Math.min.apply(null,ys);
  const w=Math.max.apply(null,xs)-minx+1, h=Math.max.apply(null,ys)-miny+1;
  g.style.gridTemplateColumns="repeat("+w+",6px)";
  g.style.gridTemplateRows="repeat("+h+",6px)";
  const on=new Set(cells.map(c=>(c.x-minx)+","+(c.y-miny)));
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=el("i","cgc"+(on.has(x+","+y)?" on":""));
    i.style.gridColumn=(x+1); i.style.gridRow=(y+1);
    g.appendChild(i);
  }
  return g;
}
function syIcon(id){ const im=new Image(); im.className="sy-mi"; im.loading="lazy"; im.src="icons/"+id+".png"; im.onerror=function(){this.style.visibility="hidden";}; return im; }
// «Верфь» Цикла 6: одна база (сетка частей) + модули (footprint + рецепт)
function renderShipyard(d){
  const sy=DATA.shipyard;
  if(!sy||!sy.base){ d.appendChild(el("div","cycle6msg","нет данных верфи")); return; }
  const wrap=el("div","shipyard");
  wrap.appendChild(el("div","sy-title","🛠 "+i18n("Верфь — модульная постройка")));
  // --- база ---
  const b=sy.base, bc=el("div","sy-base");
  bc.appendChild(el("div","sy-h",i18n("База")));
  const meta=el("div","sy-meta");
  meta.appendChild(el("span","sy-chip","⛽ "+((b.fuel&&b.fuel.name)||"—")));
  const hpAll=b.parts.reduce((a,p)=>a+((p.hp&&p.hp.length)||0),0);
  meta.appendChild(el("span","sy-chip",i18n("частей")+": "+b.parts.length));
  meta.appendChild(el("span","sy-chip","hardpoints: "+hpAll));
  meta.appendChild(el("span","sy-chip",i18n("предустановлено")+": "+b.interior.length));
  bc.appendChild(meta);
  const pmap=el("div","sy-parts");
  b.parts.forEach(p=>{ const pc=el("div","sy-part"); pc.appendChild(cellGrid(p.cells,"part")); pmap.appendChild(pc); });
  bc.appendChild(pmap);
  if(b.interior&&b.interior.length){
    const il=el("div","sy-interior");
    b.interior.forEach(i=>{ const ch=el("span","sy-ichip"); ch.appendChild(syIcon(i.id)); ch.appendChild(el("span","",i.name||("#"+i.id))); il.appendChild(ch); });
    bc.appendChild(il);
  }
  wrap.appendChild(bc);
  // --- модули по системам ---
  const mwrap=el("div","sy-mods");
  mwrap.appendChild(el("div","sy-h",i18n("Модули")+" ("+sy.modules.length+")"));
  const bySys={}; sy.modules.forEach(m=>{ (bySys[m.sys||"other"]=bySys[m.sys||"other"]||[]).push(m); });
  Object.keys(bySys).sort().forEach(sys=>{
    const grp=el("div","sy-grp");
    grp.appendChild(el("div","sy-sys",String(sys).replace(/_/g," ")));
    const cards=el("div","sy-cards");
    bySys[sys].forEach(m=>{
      const c=el("div","sy-card");
      c.appendChild(syIcon(m.id));
      const info=el("div","sy-info");
      info.appendChild(el("div","sy-name",m.name));
      const tags=el("div","sy-tags");
      if(m.cap) tags.appendChild(el("span","sy-tag cap",m.cap));
      tags.appendChild(el("span","sy-tag hp",(m.hp&&m.hp.length)?m.hp.join("/"):"internal"));
      tags.appendChild(el("span","sy-tag",(m.bbox?m.bbox[0]+"×"+m.bbox[1]:"")+" · "+(m.cells?m.cells.length:0)+" cells"));
      info.appendChild(tags);
      c.appendChild(info);
      c.appendChild(cellGrid(m.cells,"mod"));
      if(m.bp!=null){ const btn=el("button","mini sy-craft",i18n("Рецепт")); btn.onclick=()=>{ location.hash="#"+m.id; }; c.appendChild(btn); }
      cards.appendChild(c);
    });
    grp.appendChild(cards); mwrap.appendChild(grp);
  });
  wrap.appendChild(mwrap);
  d.appendChild(wrap);
}
