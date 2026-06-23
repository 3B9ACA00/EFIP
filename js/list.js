// ── Раздел «Список крафта»: агрегированный расчёт ресурсов на список предметов ──
// Источник истины — URL-хеш (#list=87161.84180x10), + бэкап в localStorage.
// Движок ПЕРЕИСПОЛЬЗУЕТСЯ через ВИРТУАЛЬНЫЙ КОРЕНЬ (LIST_ROOT): синтетический рецепт,
// чьи входы = предметы списка → renderPlan(LIST_ROOT, 1) даёт сводный план (руда/рефайн/
// крафт/склад/итоги), volume-оптимизированный, с зачётом склада. См. plan() / renderPlan().

function saveCraftList(){ try{ localStorage.setItem("ef_craftlist", JSON.stringify(craftList)); }catch(e){} }
function listCount(){ return craftList.reduce((s,x)=>s+(x.qty>0?1:0),0); }

// компактная сериализация в URL: #list=id[xqty].id[xqty]…  (qty опускается при 1)
function listHash(){
  const toks = craftList.filter((x)=>x.qty>0).map((x)=> x.qty>1 ? (x.id+"x"+x.qty) : String(x.id));
  return "list" + (toks.length ? "="+toks.join(".") : "");
}
function parseCraftList(raw){
  return String(raw||"").split(".").map((tok)=>{
    const m = tok.match(/^(\d+)(?:x(\d+))?$/); if(!m) return null;
    const id = +m[1]; if(!T[id]) return null;
    return { id, qty: Math.max(1, m[2] ? +m[2] : 1) };
  }).filter(Boolean);
}
// войти в список из URL/permalink: raw==null (хеш «#list» без «=») → берём текущий/localStorage; иначе парсим
function enterList(raw){
  if(raw == null){
    if(!craftList.length){ try{ craftList = (JSON.parse(localStorage.getItem("ef_craftlist")||"[]")||[]).filter((x)=> x && T[x.id]); }catch(e){} }
  } else craftList = parseCraftList(raw);
}

function updateListNav(){
  const a = document.getElementById("navlist"); if(!a) return;
  const n = listCount();
  a.textContent = i18n("📋 Список") + (n ? (" ("+n+")") : "");
  a.classList.toggle("active", !!listMode);
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
function setListQty(id, qty){ const e = craftList.find((x)=>x.id===id); if(!e) return; e.qty = Math.max(1, qty||1); saveCraftList(); showList(); }
function clearList(){ confirmModal(i18n("Очистить весь список крафта?"), ()=>{ craftList = []; saveCraftList(); showList(); }); }

// синтетический рецепт: входы = предметы списка → renderPlan сводит весь BOM
function buildListRoot(){
  const items = craftList.filter((x)=>x.qty>0).map((x)=>({ id:x.id, q:x.qty }));
  T[LIST_ROOT] = { id:LIST_ROOT, name:i18n("📋 Список крафта"), cat:"Unknown", grp:"", vol:0, mass:0, icon:0 };
  byOut[LIST_ROOT] = items.length ? [{ bp:LIST_ROOT, inp:items, out:[{ id:LIST_ROOT, q:1 }], rt:0, fac:[] }] : [];
  resetCost();
}

// ── рендер раздела ──
function showList(){
  listMode = true; selected = null; fitMode = false;
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

  // — предметы списка: иконка · имя · степпер кол-ва · удалить —
  const lt = el("div","listitems");
  craftList.forEach((x)=>{
    const row = el("div","litem");
    const ic = el("span","lic"); ic.style.cursor="pointer"; ic.onclick=()=>showDetail(x.id); ic.appendChild(icon(x.id,36)); row.appendChild(ic);
    const nm = el("span","lnm", esc(ty(x.id).name)); nm.style.cursor="pointer"; nm.onclick=()=>showDetail(x.id); row.appendChild(nm);
    if(!isCraftable(x.id)) nm.appendChild(el("span","tag raw"," "+i18n("сырьё")));
    const qb = el("div","lqty");
    const dec = el("button","pstep"); dec.type="button"; dec.textContent="−"; dec.onclick=()=>setListQty(x.id, x.qty-1);
    const inp = el("input"); inp.type="number"; inp.min="1"; inp.value=String(x.qty); inp.onchange=()=>setListQty(x.id, parseInt(inp.value)||1);
    const inc = el("button","pstep"); inc.type="button"; inc.textContent="+"; inc.onclick=()=>setListQty(x.id, x.qty+1);
    qb.appendChild(dec); qb.appendChild(inp); qb.appendChild(inc); row.appendChild(qb);
    const del = el("button","sxb del"); del.innerHTML=ICO_DEL; del.title=i18n("Удалить"); del.onclick=()=>removeFromList(x.id); row.appendChild(del);
    lt.appendChild(row);
  });
  d.appendChild(lt);

  // — агрегированный план: переиспользуем renderPlan через виртуальный корень —
  buildListRoot();
  const planHost = el("div","listplan"); d.appendChild(planHost);
  renderPlan(LIST_ROOT, 1, planHost);
  d.scrollTop = sc;
}
