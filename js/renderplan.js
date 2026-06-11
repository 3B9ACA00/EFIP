// ── план ─────────────────────────────────────────────
// SVG-иконки действий (monochrome, currentColor → перекрашиваются на ховере)
const ICO_EDIT='<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
const ICO_EYE='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>';
const ICO_DEL='<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
function renderPlan(id, qty, host){
  _lastPlan = { id, qty, host };
  for(const k in _limitOverride) delete _limitOverride[k];
  if(oreMode==="custom") applyOreLimits(id, qty);      // custom: ручные лимиты руды → _limitOverride (LP-выбор для volume/time делает сам plan())
  const { tree, raw, steps, byprod, totalTime, items } = plan(id, qty);
  host.innerHTML = "";

  // ── листья: руда / лут / заблокировано (нет постройки) ──
  const oreR={}, lootR={}, blockedR={};
  for(const [rid,q] of Object.entries(raw)){
    const k=+rid;
    if(blockedItem(k)) blockedR[k]=q; else if(isLoot(k)) lootR[k]=q; else oreR[k]=q;
  }
  // нехватка построек
  if(Object.keys(blockedR).length){
    const warn=el("div","blockwarn");
    warn.appendChild(el("div","bwh",i18n("⚠ Не хватает построек — без них эти предметы не сделать:")));
    Object.entries(blockedR).forEach(([bid,q])=>{
      const uniq=[...new Set((byOut[+bid]||[]).flatMap((r)=>r.fac||[]))];
      const li=el("div","gli");
      li.appendChild(el("span","q",num(q)+"×")); li.appendChild(icon(+bid,28));
      li.appendChild(el("span","nm"," "+esc(ty(+bid).name)+i18n(" — отметь одну из: {list}", {list:uniq.map((f)=>esc(ty(f).name)).join(", ")})));
      warn.appendChild(li);
    });
    host.appendChild(warn);
  }
  // ── план: 3 нумерованных этапа (таблицы) ──
  const guide=el("div","guide");
  // данные панели приоритета руд + предупреждение, если выключена обязательная руда
  const planOreList = [...new Set([...planOres(id), ...Object.keys(oreR).map(Number)])];   // кандидаты приоритета ∪ реально добытое (LP-сплиты)
  const reqOff = requiredDisabledOres(id);
  const oreBlocked = blockedMaterials(id).filter((m)=> (byOut[m]||[]).some(facOk));   // блок из-за выключенной руды (не из-за постройки)
  if(oreBlocked.length) host.appendChild(el("div","orewarn", i18n("⚠ Крафт невозможен — нет источника: {n}. Верни выключенную руду.", {n:oreBlocked.map((m)=>esc(ty(m).name)).join(", ")})));
  const overLimit = new Set(oresOverLimit({raw}));   // руды, оставшиеся над лимитом (рероут не помог)
  if(overLimit.size) host.appendChild(el("div","orewarn lim", i18n("⚠ Не уложиться в лимит: {n} — не хватает альтернатив.", {n:[...overLimit].map((o)=>esc(ty(o).name)).join(", ")})));
  const recompute = ()=>{ const sc=$("#detail")?$("#detail").scrollTop:0; saveOrePrefs(); resetCost(); showDetail(id); if($("#detail")) $("#detail").scrollTop=sc; };
  // ячейка «уже есть» (склад): вводишь сколько есть → вычитается из спроса плана
  const haveInput=(itm)=>{ const td=el("td","havetd"); const i=el("input"); i.type="number"; i.min="0"; i.placeholder="0"; i.className="havein"; i.value=stock[itm]>0?String(stock[itm]):"";
    i.title=i18n("Уже есть (вычтется из плана)"); i.onclick=(e)=>e.stopPropagation();
    i.onchange=()=>{ const v=parseInt(i.value)||0; if(v>0) stock[itm]=v; else delete stock[itm]; recompute(); };
    td.appendChild(i); return td; };
  // секция: заголовок (+опц. кнопка справа) + таблица; build(tbody) наполняет строки, возвращает <thead>
  const planSec=(title,cls,build,headBtn)=>{
    const s=el("div","gsec "+cls);
    const h=el("div","gsech"); h.appendChild(el("span",null,title)); if(headBtn) h.appendChild(headBtn);
    s.appendChild(h);
    const tbl=el("table","plantbl"), tb=el("tbody");
    tbl.appendChild(build(tb)); tbl.appendChild(tb);
    s.appendChild(tbl); guide.appendChild(s);
  };
  const startMap = Object.assign({}, oreR, lootR);   // добыча + лут одной таблицей
  // ЭТАП «добыча» = ПАНЕЛЬ ПРИОРИТЕТА РУД: ТАБЛИЦА (стрелки ↑↓ = приоритет, ☑ = вкл/выкл) + лут внизу (last resort)
  const prioOf=(oid)=>{ const p=orePriority.indexOf(oid); return p<0?1e9:p; };
  const oreList = planOreList.slice().sort((a,b)=>{
    if(oreMode==="custom"){ const pa=prioOf(a),pb=prioOf(b); if(pa!==pb)return pa-pb; }   // ручной приоритет — только в Custom
    const qa=oreR[a]||0,qb=oreR[b]||0; if(qa!==qb)return qb-qa;   // авто-стратегии: по УБЫВАНИЮ нужного количества
    return ty(a).name.localeCompare(ty(b).name);
  });
  const moveOre=(oid,dir)=>{ const cur=oreList.slice(); const i=cur.indexOf(oid), j=i+dir; if(j<0||j>=cur.length) return; oreMode="custom"; [cur[i],cur[j]]=[cur[j],cur[i]]; orePriority=cur.concat(orePriority.filter((x)=>!cur.includes(x))); recompute(); };
  const reorderTo=(src,tgt)=>{ if(!src||src===tgt) return; oreMode="custom"; const order=oreList.filter((x)=>x!==src); const ti=order.indexOf(tgt); order.splice(ti<0?order.length:ti,0,src); orePriority=order.concat(orePriority.filter((x)=>!order.includes(x))); recompute(); };
  const PRESET_DESC={ volume:"Минимум объёма руды на хаул — макс. выход материала на m³.", time:"Минимум суммарного времени переработки.", custom:"Ручной порядок (тащи строку / стрелки ▲▼), вкл/выкл, лимиты по руде." };
  const mineSec=(title, headBtn)=>{
    const cust = oreMode==="custom";
    const s=el("div","gsec start");
    const h=el("div","gsech"); h.appendChild(el("span",null,title));
    if(oreList.length) h.appendChild(el("span","oreshint", cust ? i18n("тащи строку или ▲▼ = приоритет · ☑ вкл/выкл") : i18n("порядок — авто по пресету")));
    if(cust && Object.keys(oreLimit).length){ const rb=el("button","sec-btn mini2", i18n("⟲ Сбросить лимиты")); rb.onclick=()=>{ for(const k in oreLimit) delete oreLimit[k]; recompute(); }; h.appendChild(rb); }
    if(headBtn) h.appendChild(headBtn);
    s.appendChild(h);
    const psel=el("div","orepresets");
    [["volume","⛏ Мин. объём руды"],["time","⏱ Мин. время производства"],["custom","✎ Custom"]].forEach(([m,lbl])=>{ const b=el("button","presetbtn"+(oreMode===m?" on":""), i18n(lbl)); b.onclick=()=>{ oreMode=m; recompute(); }; psel.appendChild(b); });
    s.appendChild(psel);
    s.appendChild(el("div","presetdesc", i18n(PRESET_DESC[oreMode]||"")));
    if(oreList.length || Object.keys(lootR).length){
      const tbl=el("table","oretbl");
      const hasStockCol = oreList.some((o)=>stockQty(o)>0) || Object.keys(lootR).some((l)=>stockQty(+l)>0);   // активный склад руды/лута → колонка «+N»
      const heads=["","#","",i18n("Руда"),i18n("Нужно")].concat(hasStockCol?[i18n("Склад")]:[]).concat(cust?[i18n("Лимит")]:[]).concat([i18n("вкл")]);
      const thr=el("tr"); heads.forEach((hh,ci)=> thr.appendChild(el("th",(ci>=4?"ar":""), hh))); const thd=el("thead"); thd.appendChild(thr); tbl.appendChild(thd);
      const tb=el("tbody");
      oreList.forEach((oid,idx)=>{
        const off=oreDisabled.has(oid), used=(oreR[oid]||0)>0, isReq=reqOff.has(oid)||overLimit.has(oid);
        const tr=el("tr","orerow"+(off?" off":"")+(isReq?" req":"")+(used?" used":" alt")); tr.dataset.ore=oid;
        if(cust && !off){ tr.draggable=true;
          tr.addEventListener("dragstart",(e)=>{ e.dataTransfer.setData("text/plain",String(oid)); e.dataTransfer.effectAllowed="move"; tr.classList.add("dragging"); });
          tr.addEventListener("dragend",()=>tr.classList.remove("dragging"));
          tr.addEventListener("dragover",(e)=>{ e.preventDefault(); tr.classList.add("droptgt"); });
          tr.addEventListener("dragleave",()=>tr.classList.remove("droptgt"));
          tr.addEventListener("drop",(e)=>{ e.preventDefault(); tr.classList.remove("droptgt"); reorderTo(+e.dataTransfer.getData("text/plain"), oid); });
        }
        const ar=el("td","orearr");
        if(cust){   // приоритет руками — только в Custom; в авто-пресетах порядок задаёт сам пресет
          const up=el("button","orear"+(idx===0?" dis":""),"▲"); up.title=i18n("Выше приоритет"); if(idx>0) up.onclick=()=>moveOre(oid,-1);
          const dn=el("button","orear"+(idx===oreList.length-1?" dis":""),"▼"); dn.title=i18n("Ниже приоритет"); if(idx<oreList.length-1) dn.onclick=()=>moveOre(oid,1);
          ar.appendChild(up); ar.appendChild(dn);
        }
        tr.appendChild(ar);
        tr.appendChild(el("td","orerank2", String(idx+1)));
        const ci=el("td","oreic"); ci.style.cursor="pointer"; ci.onclick=()=>showDetail(oid); ci.appendChild(icon(oid,34)); tr.appendChild(ci);
        const nm=el("td","orenm2", esc(ty(oid).name)); nm.style.cursor="pointer"; nm.onclick=()=>showDetail(oid); tr.appendChild(nm);
        tr.appendChild(el("td","orest"+(used?"":" alt"), used?num(oreR[oid])+"×":i18n("альт")));
        if(hasStockCol){ const sq=stockQty(oid); tr.appendChild(el("td","orestock", sq>0?"+"+num(sq):"")); }
        if(cust){
          const ltd=el("td","orelim");
          const li=el("input"); li.type="number"; li.min="0"; li.placeholder="∞"; li.className="orelimin"; li.value=oreLimit[oid]>0?String(oreLimit[oid]):"";
          li.title=i18n("Лимит копки (макс. ед.); пусто = без лимита"); li.onclick=(e)=>e.stopPropagation();
          li.onchange=()=>{ const v=parseInt(li.value)||0; if(v>0) oreLimit[oid]=v; else delete oreLimit[oid]; recompute(); };
          ltd.appendChild(li);
          if(oreLimit[oid]>0){ const xb=el("button","limx","×"); xb.title=i18n("Сбросить лимит"); xb.onclick=(e)=>{ e.stopPropagation(); delete oreLimit[oid]; recompute(); }; ltd.appendChild(xb); }
          tr.appendChild(ltd);
        }
        const tgtd=el("td","oretgtd");
        const cb=el("input"); cb.type="checkbox"; cb.className="oretgbig"; cb.checked=!off; cb.title=off?i18n("Включить руду"):i18n("Выключить руду");
        cb.onclick=(e)=>{ e.stopPropagation(); if(cb.checked) oreDisabled.delete(oid); else oreDisabled.add(oid); recompute(); };
        tgtd.appendChild(cb); tr.appendChild(tgtd);
        tb.appendChild(tr);
      });
      // лут — в конце той же таблицы (last resort); галочка вкл/выкл (выключение → материал из руды/крафта)
      const lootRows=[...new Set([...Object.keys(lootR).map(Number), ...planLoot(id).filter((l)=>oreDisabled.has(l))])];
      lootRows.sort((a,b)=>(lootR[b]||0)-(lootR[a]||0)).forEach((lid)=>{
        const off=oreDisabled.has(lid), used=(lootR[lid]||0)>0;
        const tr=el("tr","orerow lootrow"+(off?" off":"")+(used?" used":" alt"));
        tr.appendChild(el("td","orearr")); tr.appendChild(el("td","orerank2","🎁"));
        const ci=el("td","oreic"); ci.style.cursor="pointer"; ci.onclick=()=>showDetail(lid); ci.appendChild(icon(lid,34)); tr.appendChild(ci);
        tr.appendChild(el("td","orenm2", esc(ty(lid).name)));
        tr.appendChild(el("td","orest"+(used?"":" alt"), used?num(lootR[lid])+"×":i18n("альт")));
        if(hasStockCol){ const sq=stockQty(lid); tr.appendChild(el("td","orestock", sq>0?"+"+num(sq):"")); }
        if(cust) tr.appendChild(el("td","orelim"));
        const tgtd=el("td","oretgtd");
        const cb=el("input"); cb.type="checkbox"; cb.className="oretgbig"; cb.checked=!off; cb.title=off?i18n("Включить лут"):i18n("Выключить лут (если есть рудная альтернатива)");
        cb.onclick=(e)=>{ e.stopPropagation();
          if(cb.checked){ oreDisabled.delete(lid); recompute(); return; }
          oreDisabled.add(lid);
          if(oreMode!=="custom" && !lpSelect(id, qty)){ oreDisabled.delete(lid); cb.checked=true; tr.classList.add("noalt"); setTimeout(()=>tr.classList.remove("noalt"),900); return; }   // нет рудной альтернативы — откат
          recompute();
        };
        tgtd.appendChild(cb); tr.appendChild(tgtd);
        tb.appendChild(tr);
      });
      tbl.appendChild(tb); s.appendChild(tbl);
    }
    guide.appendChild(s);
  };
  // ── БЛОК 0: СКЛАД — что уже есть (руда / рефайн / крафт); вычитается из плана ──
  const stockSec=(its)=>{
    const avail = (its||[]).filter((it)=> it!==id && !(it in stock));   // доступно для добавления: BOM − финал − уже добавленные
    const sKey=(it)=>{ const c=_stockSort.col; return c==="name"?ty(it).name.toLowerCase() : c==="comment"?(stock[it].comment||"").toLowerCase() : c==="qty"?(stock[it].qty||0) : (stock[it].ord||0); };
    const entries = Object.keys(stock).map(Number).sort((a,b)=>{ const ka=sKey(a),kb=sKey(b); return (ka<kb?-1:ka>kb?1:0)*_stockSort.dir; });
    const s=el("div","gsec stock");
    const h=el("div","gsech"); h.appendChild(el("span",null,"0 · "+i18n("Склад"))); s.appendChild(h);
    const tbl=el("table","stocktbl");
    const thr=el("tr"); thr.appendChild(el("th","",""));
    [["Ресурс","name",""],["Комментарий","comment",""],["Кол-во","qty","ar"]].forEach(([lbl,col,cls])=>{
      const th=el("th","sortable"+(cls?" "+cls:"")+(_stockSort.col===col?" sorted":""), i18n(lbl)+(_stockSort.col===col?(_stockSort.dir>0?" ▲":" ▼"):""));
      th.onclick=()=>{ if(_stockSort.col===col) _stockSort.dir*=-1; else { _stockSort.col=col; _stockSort.dir=1; } recompute(); };
      thr.appendChild(th);
    });
    thr.appendChild(el("th","ar", i18n("Действия")));
    const thd=el("thead"); thd.appendChild(thr); tbl.appendChild(thd);
    const tb=el("tbody"); tbl.appendChild(tb);
    entries.forEach((it)=> tb.appendChild(dispRow(it)));
    s.appendChild(tbl);
    if(!entries.length) s.appendChild(el("div","note stocknote", i18n("Пусто — добавь ресурс ниже.")));
    const bar=el("div","stockbar");
    const addBtn=el("button","sec-btn mini2", i18n("➕ Добавить ресурс")); if(!avail.length) addBtn.disabled=true; addBtn.onclick=()=> addDraft(); bar.appendChild(addBtn);
    if(entries.length){ const clr=el("button","sec-btn mini2", i18n("Очистить")); clr.onclick=()=>{ for(const k in stock) delete stock[k]; recompute(); }; bar.appendChild(clr); }
    s.appendChild(bar);
    guide.appendChild(s);

    function dispRow(it){
      const e=stock[it]; const tr=el("tr","strow"+(e.off?" off":""));
      const ci=el("td","sic"); ci.style.cursor="pointer"; ci.onclick=()=>showDetail(it); ci.appendChild(icon(it,30)); tr.appendChild(ci);
      tr.appendChild(el("td","snm", esc(ty(it).name)));
      tr.appendChild(el("td","scm", e.comment?esc(e.comment):"—"));
      tr.appendChild(el("td","sqty ar", num(e.qty||0)));
      const act=el("td","sact");
      act.appendChild(actBtn(ICO_EDIT, i18n("Редактировать"), ()=> editRow(tr,it), "ed"));
      act.appendChild(actBtn(ICO_EYE, e.off?i18n("Включить"):i18n("Отключить"), ()=>{ e.off=!e.off; recompute(); }, "eye"+(e.off?" eyeoff":"")));
      act.appendChild(actBtn(ICO_DEL, i18n("Удалить"), ()=>{ delete stock[it]; recompute(); }, "del"));
      tr.appendChild(act); return tr;
    }
    function editRow(tr, it){
      const e=stock[it]; tr.className="strow editing"; tr.innerHTML="";
      const ci=el("td","sic"); ci.appendChild(icon(it,30)); tr.appendChild(ci);
      tr.appendChild(el("td","snm", esc(ty(it).name)));
      const cm=mkInput("text", e.comment||"", i18n("комментарий")); const cmTd=el("td","scm"); cmTd.appendChild(cm); tr.appendChild(cmTd);
      const qi=mkInput("number", e.qty||"", "0", "qin"); const qTd=el("td","sqty ar"); qTd.appendChild(qi); tr.appendChild(qTd);
      const act=el("td","sact");
      const save=()=>{ const q=parseInt(qi.value)||0; if(!q) delete stock[it]; else { e.qty=q; e.comment=cm.value.trim(); } recompute(); };
      act.appendChild(actBtn("✓", i18n("Сохранить"), save, "ok"));
      act.appendChild(actBtn("×", i18n("Отмена"), ()=> tr.replaceWith(dispRow(it))));
      tr.appendChild(act); qi.focus(); cm.onkeydown=qi.onkeydown=(ev)=>{ if(ev.key==="Enter") save(); };
    }
    function itemGroup(it){ return !isCraftable(it) ? 0 : (isRefineStep(it) ? 1 : 2); }   // 0 руда/лут · 1 рефайн · 2 крафт
    function addDraft(){
      if(!avail.length) return;
      const tr=el("tr","strow editing draft"); tb.appendChild(tr);
      const icTd=el("td","sic"); const icoW=el("span"); icTd.appendChild(icoW); tr.appendChild(icTd);
      let chosen=null;
      const pk=el("div","picker"); const pb=el("button","pickbtn", i18n("— выбери ресурс —")); pk.appendChild(pb);
      const menu=el("div","pickmenu"); pk.appendChild(menu);
      const selTd=el("td","snm"); selTd.appendChild(pk); tr.appendChild(selTd);
      const cm=mkInput("text","",i18n("комментарий")); const cmTd=el("td","scm"); cmTd.appendChild(cm); tr.appendChild(cmTd);
      const qi=mkInput("number","","0","qin"); const qTd=el("td","sqty ar"); qTd.appendChild(qi); tr.appendChild(qTd);
      // опции с иконками, группами Руда/Рефайн/Крафт + разделители
      [[0,"Руда"],[1,"Рефайн"],[2,"Крафт"]].forEach(([g,lbl])=>{
        const items=avail.filter((it)=>itemGroup(it)===g).sort((a,b)=>ty(a).name.localeCompare(ty(b).name));
        if(!items.length) return;
        menu.appendChild(el("div","pickgrp", i18n(lbl)));
        items.forEach((it)=>{ const o=el("div","pickopt"); o.appendChild(icon(it,22)); o.appendChild(el("span",null, esc(ty(it).name)));
          o.onclick=()=>{ chosen=it; pb.innerHTML=""; pb.appendChild(icon(it,22)); pb.appendChild(el("span","pbnm"," "+esc(ty(it).name))); menu.classList.remove("open"); icoW.innerHTML=""; icoW.appendChild(icon(it,30)); qi.focus(); };
          menu.appendChild(o); });
      });
      pb.onclick=(e)=>{ e.stopPropagation(); menu.classList.toggle("open"); };
      const closeMenu=(e)=>{ if(!pk.contains(e.target)) menu.classList.remove("open"); };
      setTimeout(()=> document.addEventListener("click", closeMenu), 0);
      const fin=()=> document.removeEventListener("click", closeMenu);
      const act=el("td","sact");
      const add=()=>{ if(!chosen){ menu.classList.add("open"); return; } const q=parseInt(qi.value)||0; if(!q){ qi.focus(); return; } fin(); const nord=Object.values(stock).reduce((m,e)=>Math.max(m,e.ord||0),0)+1; stock[chosen]={qty:q, comment:cm.value.trim(), off:false, ord:nord}; recompute(); };
      act.appendChild(actBtn("✓", i18n("Добавить"), add, "ok"));
      act.appendChild(actBtn("×", i18n("Отмена"), ()=>{ fin(); tr.remove(); }));
      tr.appendChild(act);
      menu.classList.add("open"); qi.onkeydown=(ev)=>{ if(ev.key==="Enter") add(); };
    }
    function actBtn(label, title, fn, cls){ const b=el("button","sxb"+(cls?" "+cls:""), label); b.title=title; b.onclick=(e)=>{ e.stopPropagation(); fn(); }; return b; }
    function mkInput(type, val, ph, cls){ const i=el("input"); i.type=type; if(type==="number") i.min="0"; i.className="sin"+(cls?" "+cls:""); i.placeholder=ph||""; i.value=val; i.onclick=(e)=>e.stopPropagation(); return i; }
  };
  // ЭТАП шагов (крафт): один ряд на ПРОГОН рецепта (LP может расщеплять материал на неск. рецептов)
  const stepSec=(title,cls,sts)=> planSec(title,cls,(tb)=>{
    sts.forEach(({id:x, r, runs, qty, rt})=>{
      const tr=el("tr","prow"); tr.onclick=()=>showDetail(x);
      const ci=el("td","pic"); ci.appendChild(icon(x,30)); tr.appendChild(ci);
      tr.appendChild(el("td","pnm",esc(ty(x).name)));
      tr.appendChild(el("td","pnum",num(qty)+i18n(" шт")));
      tr.appendChild(el("td","pruns",num(runs)+"×"));
      tr.appendChild(el("td","ptime",fmtTime(rt)));
      const fac=(r.fac||[]).map((f)=>ty(f).name)[0];
      tr.appendChild(el("td","pfac",fac?esc(fac):"—"));
      tr.appendChild(el("td","pfrom",esc(r.inp.map((i)=>num(i.q*runs)+" "+ty(i.id).name).join(", "))));
      tb.appendChild(tr);
    });
    return el("thead",null,i18n("<tr><th></th><th>Компонент</th><th class='ar'>Кол-во</th>")
      +i18n("<th class='ar' title='Сколько раз запускается рецепт'>Прогоны</th>")
      +i18n("<th class='ar'>Время</th><th>Постройка</th><th>Сырьё на шаг</th></tr>"));
  });
  // ЭТАП переработки: «из чего (руда) → получаем (материал + побочка)» + прогоны/время/постройка
  const refineSec=(title,sts)=> planSec(title,"refine",(tb)=>{
    sts.forEach(({id:x, r, runs})=>{
      const tr=el("tr","prow"); tr.onclick=()=>showDetail(x);
      const cf=el("td","pfrom2");
      r.inp.forEach((i)=>{ const c=el("span","reschip"); c.appendChild(icon(i.id,26));
        c.appendChild(el("span",null," "+num(i.q*runs)+"× "+esc(ty(i.id).name))); cf.appendChild(c); });
      tr.appendChild(cf);
      tr.appendChild(el("td","parrow","→"));
      const ct=el("td","pto");   // ВСЕ выходы рецепта: целевой + побочные (мульти-выход переработки)
      r.out.forEach((o)=>{ const c=el("span","reschip"+(o.id===x?"":" co")); c.appendChild(icon(o.id,26));
        c.appendChild(el("span",null," "+num(o.q*runs)+"× "+esc(ty(o.id).name)));
        if(o.id!==x) c.appendChild(el("span","cotag", i18n("побочно")));
        ct.appendChild(c); });
      tr.appendChild(ct);
      tr.appendChild(el("td","pruns",num(runs)+"×"));
      tr.appendChild(el("td","ptime",fmtTime((r.rt||0)*runs)));
      tr.appendChild(el("td","pfac",(r.fac||[]).map((f)=>ty(f).name)[0]||"—"));
      tb.appendChild(tr);
    });
    return el("thead",null,i18n("<tr><th>Из чего</th><th></th><th>Получаем</th><th class='ar'>Прогоны</th><th class='ar'>Время</th><th>Постройка</th></tr>"));
  });
  const dmemo={};
  const refineSteps=(steps||[]).filter((s)=>isRefineStepR(s.r)).sort((a,b)=>nodeDepth(a.id,dmemo)-nodeDepth(b.id,dmemo));
  const craftSteps =(steps||[]).filter((s)=>!isRefineStepR(s.r)).sort((a,b)=>nodeDepth(a.id,dmemo)-nodeDepth(b.id,dmemo));
  // кнопка «копировать сырьё» (руда+лут) — в шапке этапа добычи
  const copyBtn = el("button","sec-btn mini2",i18n("⧉ копировать сырьё"));
  copyBtn.onclick = ()=>{
    const all = Object.assign({}, lootR, oreR);
    const txt = Object.entries(all).sort((a,b)=>b[1]-a[1]).map(([rid,q])=>`${num(q)}\t${ty(+rid).name}`).join("\n");
    navigator.clipboard.writeText(txt).then(()=>{ copyBtn.textContent=i18n("✓ скопировано"); setTimeout(()=>copyBtn.textContent=i18n("⧉ копировать сырьё"),1500); }).catch(()=>{});
  };
  // нумеруем только присутствующие этапы
  stockSec(items);   // блок 0 — склад (что уже есть)
  let n=0;
  if(planOreList.length || Object.keys(lootR).length) mineSec((++n)+" · "+i18n("Добыча и лут"), copyBtn);
  if(refineSteps.length) refineSec((++n)+" · "+i18n("Переработка"), refineSteps);
  if(craftSteps.length) stepSec((++n)+" · "+i18n("Крафт"), "craft", craftSteps);
  host.appendChild(guide);

  // объёмы для итогов
  const rawVol  = Object.entries(oreR ).reduce((s,[i,q])=>s+(ty(+i).vol||0)*q, 0);
  const lootVol = Object.entries(lootR).reduce((s,[i,q])=>s+(ty(+i).vol||0)*q, 0);
  const hasLoot = Object.keys(lootR).length > 0;

  const tot = el("div","totals",
    i18n("Цель: <b>{q} × {name}</b> &nbsp;·&nbsp; ⛏ руда: <b>{ore} м³</b>", {q:num(qty), name:esc(ty(id).name), ore:num(rawVol)}) +
    (hasLoot ? i18n(" &nbsp;·&nbsp; <span class=\"lootw\">🎁 лут: {v} м³</span>", {v:num(lootVol)}) : ``) +
    i18n(" &nbsp;·&nbsp; время: <b>{time}</b>", {time:fmtTime(totalTime)}));
  host.appendChild(tot);

  // побочные продукты (бонусом получишь при крафте)
  const bp = Object.entries(byprod).filter(([bid])=>+bid!==id && !raw[bid]);
  if(bp.length){
    const bsec = el("details","sec foldsec"); bsec.open = true; bsec.appendChild(el("summary",null,i18n("🎁 Побочные продукты (бонусом)")));
    const bw = el("div","facwrap");
    bp.sort((a,b)=>b[1]-a[1]).forEach(([bid,q])=>{
      const chip=el("span","facchip"); chip.appendChild(icon(+bid,18));
      chip.appendChild(el("span",null,` ${num(q)} × ${esc(ty(+bid).name)}`));
      chip.onclick=()=>showDetail(+bid); bw.appendChild(chip);
    });
    bsec.appendChild(bw); host.appendChild(bsec);
  }
}
// ── дерево производства (детально) — отдельный таб ──
function renderTree(id, qty, host){
  _lastTree = { id, qty, host };
  host.innerHTML = "";
  const { tree } = plan(id, qty);
  const tw = el("div","tree"); depthOpen = 99; tw.appendChild(treeNode(tree));
  host.appendChild(tw);
}

