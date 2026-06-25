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
  // это приложение Цикла 6 — вкладка Cycle 6 всегда активна; Cycle 5 = архивная ссылка
  const e6 = document.getElementById("navc6"); if(e6) e6.classList.add("active");
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
  listMode=false; cycle6Mode=true; selected=null; fitMode=false; selectedCat=null;
  if(location.hash!=="#cycle6") history.replaceState(null,"","#cycle6");
  const d=$("#detail"); d.innerHTML="";
  renderShipyard(d);
  if(typeof renderCats==="function") renderCats();
  if(typeof renderItems==="function") renderItems();   // 2-й сайдбар = 16 модулей-конструкторов
  updateListNav(); renderCrumbs();
}
// id — это наш модуль-конструктор Верфи?
function isShipyardModule(id){
  return !!(DATA.shipyard && DATA.shipyard.modules && DATA.shipyard.modules.some(m=>m.id===id));
}
// мини-сетка cells (footprint модуля / часть базы)
function cellGrid(cells, cls, sz){
  sz=sz||6;
  const g=el("div","cg"+(cls?" "+cls:""));
  if(!cells||!cells.length) return g;
  const xs=cells.map(c=>c.x), ys=cells.map(c=>c.y);
  const minx=Math.min.apply(null,xs), miny=Math.min.apply(null,ys);
  const w=Math.max.apply(null,xs)-minx+1, h=Math.max.apply(null,ys)-miny+1;
  g.style.gridTemplateColumns="repeat("+w+","+sz+"px)";
  g.style.gridTemplateRows="repeat("+h+","+sz+"px)";
  if(cls==="hull") g.style.gap="0";   // силуэт корпуса — ячейки стык-в-стык
  const on=new Set(cells.map(c=>(c.x-minx)+","+(c.y-miny)));
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=el("i","cgc"+(on.has(x+","+y)?" on":""));
    i.style.width=sz+"px"; i.style.height=sz+"px";   // ячейка = шаг трека (для стыковки частей)
    i.style.gridColumn=(x+1); i.style.gridRow=(y+1);
    g.appendChild(i);
  }
  return g;
}
function syIcon(id){ const im=new Image(); im.className="sy-mi"; im.loading="lazy"; im.src="icons/"+id+".png"; im.onerror=function(){this.style.visibility="hidden";}; return im; }

// Силуэт базы (вид сверху). Части в SDE стоят в 3D-каркасе с зазорами и идеально
// не тайлятся 1:1. Растеризуем ВСЕ части в ОДНУ общую сетку: мировую pos делим на
// шаг G и кладём локальные ячейки целым шагом — соседние части сливаются в цельный
// корпус БЕЗ наложения сеток (каждая клетка рисуется один раз). Лево/право —
// истинные зеркала (проверено pid4↔pid5). G подобран по ASCII: связный силуэт.
function renderBaseShape(base){
  const G=1.6;   // мировых единиц на клетку (квантизация)
  const Cp=9;    // пикс на клетку
  const parts=base.parts.filter(p=>p.pos);
  const on=new Set();                 // занятые клетки общей сетки: "x,y"
  const prongs=[];                    // части без ячеек («рога») — маркеры
  let cellN=0;
  parts.forEach(p=>{
    const c=p.cells||[];
    if(!c.length){ prongs.push(p); return; }
    cellN+=c.length;
    const xs=c.map(v=>v.x),ys=c.map(v=>v.y);
    const mnx=Math.min.apply(null,xs),mny=Math.min.apply(null,ys);
    const w=Math.max.apply(null,xs)-mnx+1, h=Math.max.apply(null,ys)-mny+1;
    const bx=Math.round(p.pos[0]/G-(w-1)/2), by=Math.round(p.pos[2]/G-(h-1)/2);
    c.forEach(v=> on.add((bx+v.x-mnx)+","+(by+v.y-mny)) );
  });
  // Принудительная зеркальная симметрия: округление +x и −x частей расходится и
  // крылья выходят разной длины. Объединяем сетку с её отражением относительно
  // центральной оси (axisSum = MINX+MAXX, целое) — обе половины становятся равны.
  {
    const ax=[...on].map(s=>+s.split(",")[0]);
    const axisSum=Math.min.apply(null,ax)+Math.max.apply(null,ax);
    const sym=new Set();
    on.forEach(s=>{ const a=s.split(","); const x=+a[0],y=+a[1]; sym.add(x+","+y); sym.add((axisSum-x)+","+y); });
    on.clear(); sym.forEach(s=>on.add(s)); on._axisSum=axisSum;
  }
  const pts=[...on].map(s=>{ const a=s.split(","); return {x:+a[0],y:+a[1]}; });
  const gx=pts.map(p=>p.x),gy=pts.map(p=>p.y);
  const MINX=Math.min.apply(null,gx),MINY=Math.min.apply(null,gy);
  const AXIS=on._axisSum;   // ось симметрии в координатах сетки

  const bg=el("div","sy-basegrid");
  bg.appendChild(el("div","sy-h",i18n("Форма базы")+" #"+base.id+" — "+parts.length+" "+i18n("частей")+", "+cellN+" "+i18n("ячеек")));
  const stage=el("div","sy-stage");
  const g=cellGrid(pts,"hull",Cp);    // ОДНА сетка — ровные линии, без наложений
  g.style.position="absolute"; g.style.left="0"; g.style.top="0";
  stage.appendChild(g);
  // «рога» (части без ячеек) — маркеры симметрично относительно оси AXIS
  prongs.forEach(p=>{
    const mag=Math.round(Math.abs(p.pos[0])/G);
    const gxp=(p.pos[0]<0)?(AXIS/2-mag):(AXIS/2+mag);   // зеркально от центра
    const px=gxp-MINX, py=Math.round(p.pos[2]/G)-MINY;
    const e=el("div","sy-pempty","◆");
    e.style.position="absolute";
    e.style.left=(px*Cp-4)+"px"; e.style.top=(py*Cp-7)+"px";
    e.title=i18n("часть")+" #"+p.pid+" — "+i18n("без ячеек (движок/нос)");
    stage.appendChild(e);
  });
  const W=(Math.max.apply(null,gx)-MINX+1)*Cp, H=(Math.max.apply(null,gy)-MINY+1)*Cp;
  stage.style.width=W+"px"; stage.style.height=H+"px";
  const sw=el("div","sy-bgwrap"); sw.appendChild(stage);
  bg.appendChild(sw);
  return bg;
}
let syView="tile";   // вид списка модулей: плитка | таблица
// «Верфь» Цикла 6: модули корабля (главный раздел) + компактная сводка базы
function renderShipyard(d){
  const sy=DATA.shipyard;
  if(!sy||!sy.modules){ d.appendChild(el("div","cycle6msg",i18n("нет данных верфи"))); return; }
  const wrap=el("div","shipyard");
  wrap.appendChild(el("div","sy-title","🛠 "+i18n("Верфь — модульная постройка")));

  // === ФОРМА БАЗЫ — ВИД СВЕРХУ ===
  // Силуэт из SDE: единый холст в мировых координатах. 1 ЯЧЕЙКА = 1 мировая единица,
  // поэтому сетка каждой части ставится по её world position и части СТЫКУЮТСЯ в один
  // силуэт. Экран: X = pos.x (лево-право), Y = pos.z (нос −z сверху, корма +z снизу).
  // Лево/право — это РАЗНЫЕ part-graphic (зеркальные в данных), повороты нулевые.
  // Части без ячеек (10/11 — передние «рога») — маркером в их world-точке.
  if(sy.base && sy.base.parts){
    wrap.appendChild(renderBaseShape(sy.base));
  }

  // === МОДУЛИ КОРАБЛЯ — плитка / таблица (с сетками-footprint) ===
  // Дублируют 2-й сайдбар, но здесь с наглядными сетками; клик → рецепт.
  const mwrap=el("div","sy-mods");
  const head=el("div","sy-modhead");
  head.appendChild(el("div","sy-h",i18n("Модули корабля")+" · "+sy.modules.length+" "+i18n("шт")));
  const sw=el("div","sy-viewsw");
  const bTile=el("button","sy-vbtn","▦ "+i18n("плитка"));
  const bTab =el("button","sy-vbtn","☰ "+i18n("таблица"));
  bTile.onclick=()=>{ syView="tile"; fillMods(); };
  bTab.onclick =()=>{ syView="table"; fillMods(); };
  sw.appendChild(bTile); sw.appendChild(bTab); head.appendChild(sw);
  mwrap.appendChild(head);
  const body=el("div","sy-modbody"); mwrap.appendChild(body);
  // footprint справа: сетка ИЛИ «⤷ hardpoint» для внешних модулей (0 ячеек)
  function fp(m){
    if(m.cells&&m.cells.length) return cellGrid(m.cells,"mod");
    const a=el("span","sy-attach","⤷ "+((m.hp&&m.hp.length)?m.hp.join("/"):"—"));
    a.title=i18n("крепится к hardpoint (без ячеек корпуса)"); return a;
  }
  function fillMods(){
    body.innerHTML="";
    bTile.classList.toggle("on",syView!=="table"); bTab.classList.toggle("on",syView==="table");
    if(syView==="table"){
      const tbl=el("table","sy-table");
      const hr=document.createElement("tr");
      [" ","модуль","система","способность","hardpoint","ячейки","footprint"].forEach(h=>{ const th=document.createElement("th"); th.textContent=i18n(h.trim()); hr.appendChild(th); });
      tbl.appendChild(hr);
      sy.modules.forEach(m=>{
        const tr=el("tr","sy-trow"+(m.bp!=null?" clickable":""));
        if(m.bp!=null){ tr.onclick=()=>{ location.hash="#"+m.id; }; tr.title=i18n("открыть рецепт"); }
        const tdI=document.createElement("td"); tdI.appendChild(syIcon(m.id)); tr.appendChild(tdI);
        const cellsTxt=(m.cells&&m.cells.length)?(m.cells.length+(m.bbox&&m.bbox[0]?" ("+m.bbox[0]+"×"+m.bbox[1]+")":"")):"—";
        [m.name, String(m.sys||"").replace(/_/g," "), m.cap||"—", (m.hp&&m.hp.length)?m.hp.join("/"):"internal", cellsTxt].forEach(v=>{ const td=document.createElement("td"); td.textContent=v; tr.appendChild(td); });
        const tdF=document.createElement("td"); tdF.appendChild(fp(m)); tr.appendChild(tdF);
        tbl.appendChild(tr);
      });
      body.appendChild(tbl);
    } else {
      const bySys={}; sy.modules.forEach(m=>{ (bySys[m.sys||"other"]=bySys[m.sys||"other"]||[]).push(m); });
      Object.keys(bySys).sort().forEach(sys=>{
        const grp=el("div","sy-grp");
        grp.appendChild(el("div","sy-sys",String(sys).replace(/_/g," ")));
        const cards=el("div","sy-cards");
        bySys[sys].forEach(m=>{
          const c=el("div","sy-card"+(m.bp!=null?" clickable":""));
          if(m.bp!=null){ c.onclick=()=>{ location.hash="#"+m.id; }; c.title=i18n("открыть рецепт"); }
          c.appendChild(syIcon(m.id));
          const info=el("div","sy-info");
          info.appendChild(el("div","sy-name",m.name));
          const tags=el("div","sy-tags");
          if(m.cap) tags.appendChild(el("span","sy-tag cap",m.cap));
          tags.appendChild(el("span","sy-tag hp",(m.hp&&m.hp.length)?m.hp.join("/"):"internal"));
          tags.appendChild(el("span","sy-tag",(m.cells&&m.cells.length)?((m.bbox?m.bbox[0]+"×"+m.bbox[1]+" · ":"")+m.cells.length+" "+i18n("ячеек")):i18n("без ячеек")));
          info.appendChild(tags);
          c.appendChild(info);
          c.appendChild(fp(m));
          cards.appendChild(c);
        });
        grp.appendChild(cards); body.appendChild(grp);
      });
    }
  }
  fillMods();
  wrap.appendChild(mwrap);

  // === БАЗА (компактная сводка, без силуэта) ===
  const b=sy.base;
  if(b){
    const bc=el("div","sy-base");
    bc.appendChild(el("div","sy-h",i18n("База")+" #"+b.id));
    const meta=el("div","sy-meta");
    meta.appendChild(el("span","sy-chip","⛽ "+((b.fuel&&b.fuel.name)||"—")));
    meta.appendChild(el("span","sy-chip",i18n("частей корпуса")+": "+b.parts.length));
    meta.appendChild(el("span","sy-chip",i18n("предустановлено модулей")+": "+(b.interior?b.interior.length:0)));
    bc.appendChild(meta);
    if(b.interior&&b.interior.length){
      const il=el("div","sy-interior");
      b.interior.forEach(i=>{ const ch=el("span","sy-ichip"); ch.appendChild(syIcon(i.id)); ch.appendChild(el("span","",i.name||("#"+i.id))); il.appendChild(ch); });
      bc.appendChild(il);
    }
    wrap.appendChild(bc);
  }
  d.appendChild(wrap);
}
