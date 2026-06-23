// ── план ─────────────────────────────────────────────
// SVG-иконки действий (monochrome, currentColor → перекрашиваются на ховере)
const ICO_EDIT='<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
const ICO_EYE='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>';
const ICO_DEL='<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
function renderPlan(id, qty, host){
  _lastPlan = { id, qty, host };
  for(const k in _limitOverride) delete _limitOverride[k];
  if(oreMode==="custom") applyOreLimits(id, qty);      // custom: ручные лимиты руды → _limitOverride (LP-выбор для volume/time делает сам plan())
  const { tree, raw, steps, byprod, totalTime, items, demand } = plan(id, qty);
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
  const recompute = ()=>{ const sc=$("#detail")?$("#detail").scrollTop:0; saveOrePrefs(); resetCost(); if(id===LIST_ROOT) showList(); else showDetail(id); if($("#detail")) $("#detail").scrollTop=sc; };
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
        const covered=!used && (demand[oid]||0)>0 && stockQty(oid)>0;   // не копается, но РАСХОДУЕТСЯ со склада (не «альт»!)
        const tr=el("tr","orerow"+(off?" off":"")+(isReq?" req":"")+(used?" used":(covered?" cov":" alt"))); tr.dataset.ore=oid;
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
        tr.appendChild(el("td","orest"+(used?"":(covered?" cov":" alt")), used?num(oreR[oid])+"×":i18n(covered?"со склада":"альт")));
        if(hasStockCol){ const se=curStock()[oid], sq=stockQty(oid); tr.appendChild(el("td","orestock"+((se&&se.inf)?" infv":""), (se&&se.inf)?"∞":(sq>0?"+"+num(sq):""))); }
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
        if(hasStockCol){ const se=curStock()[lid], sq=stockQty(lid); tr.appendChild(el("td","orestock"+((se&&se.inf)?" infv":""), (se&&se.inf)?"∞":(sq>0?"+"+num(sq):""))); }
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
  // ── БЛОК 0: СКЛАД — ВСЕ ресурсы рецепта сразу списком (руда/рефайн/крафт); вписываешь только количества (inline). Сворачиваемый. ──
  const stockSec=(its)=>{
    const sk=curStock();   // активный склад: общий или локальный для этого предмета
    const grpOf=(it)=> !isCraftable(it) ? 0 : (isRefineStep(it) ? 1 : 2);   // 0 руда/лут · 1 рефайн · 2 крафт
    const res=allBomItems(id).filter((it)=> it!==id);   // стабильный набор (по всем рецептам), чтобы строки не скакали при правке склада
    const filledIds=Object.keys(sk).map(Number).filter((k)=> sk[k] && (sk[k].qty>0 || sk[k].inf));
    const nFilled=filledIds.length;
    const det=el("details","gsec stock");
    det.open = (_stockOpen!=null) ? _stockOpen : (nFilled>0);
    det.addEventListener("toggle", ()=>{ if(det.open!==_stockOpen){ _stockOpen=det.open; saveOrePrefs(); } });   // персист открыт/свёрнут (guard от программных ре-рендеров)
    const sum=el("summary","stocksum");
    sum.appendChild(el("span","stockttl","0 · "+i18n("Склад")));
    sum.appendChild(el("span","stocksub", nFilled?i18n("{n} заполнено",{n:nFilled}):i18n("впиши, что уже есть")));
    const grp=el("div","stockbtns");
    // выпадающее меню-иконка (sort/group) в один ряд с кнопками; opts=[{label,active,act}]
    const iconMenu=(icon, title, opts)=>{
      const pk=el("div","picker imenu"); const btn=el("button","sec-btn mini2 stbtn imbtn"); btn.innerHTML=icon+"<span class='imcar'>▾</span>"; btn.title=title;
      const menu=el("div","pickmenu");
      opts.forEach((o)=>{ const it=el("div","pickopt"+(o.active?" act":"")); it.textContent=o.label; it.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); o.act(); }; menu.appendChild(it); });
      btn.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); const op=menu.classList.contains("open"); document.querySelectorAll(".pickmenu.open").forEach((m)=>m.classList.remove("open")); if(!op) menu.classList.add("open"); };
      pk.appendChild(btn); pk.appendChild(menu); return pk;
    };
    if(!window._imClose){ window._imClose=true; document.addEventListener("click",(e)=>{ if(!e.target.closest(".imenu")) document.querySelectorAll(".pickmenu.open").forEach((m)=>m.classList.remove("open")); }); }
    const setSort=(by,dir)=>{ _stockView.by=by; _stockView.dir=dir; saveOrePrefs(); recompute(); };
    grp.appendChild(iconMenu("⇅", i18n("Сортировка"), [
      {label:i18n("Нужно ↓"), active:_stockView.by==="need"&&_stockView.dir<0, act:()=>setSort("need",-1)},
      {label:i18n("Нужно ↑"), active:_stockView.by==="need"&&_stockView.dir>0, act:()=>setSort("need",1)},
      {label:i18n("Имя А–Я"), active:_stockView.by==="name"&&_stockView.dir>0, act:()=>setSort("name",1)},
      {label:i18n("Имя Я–А"), active:_stockView.by==="name"&&_stockView.dir<0, act:()=>setSort("name",-1)},
      {label:i18n("Сток ↓"), active:_stockView.by==="have"&&_stockView.dir<0, act:()=>setSort("have",-1)},
      {label:i18n("Сток ↑"), active:_stockView.by==="have"&&_stockView.dir>0, act:()=>setSort("have",1)},
    ]));
    const setGrp=(g)=>{ _stockView.group=g; saveOrePrefs(); recompute(); };
    grp.appendChild(iconMenu("▦", i18n("Группировка"), [
      {label:i18n("По типам"), active:_stockView.group==="type", act:()=>setGrp("type")},
      {label:i18n("По уровню (этапы)"), active:_stockView.group==="level", act:()=>setGrp("level")},
      {label:i18n("По категории"), active:_stockView.group==="cat", act:()=>setGrp("cat")},
      {label:i18n("Заполнено / пусто"), active:_stockView.group==="filled", act:()=>setGrp("filled")},
      {label:i18n("Без группировки"), active:_stockView.group==="none", act:()=>setGrp("none")},
    ]));
    // единый стиль; глазик+Очистить ВСЕГДА видны (неактивны при пустом складе)
    const local=stockLocalOn.has(id);
    const lb=el("button","sec-btn mini2 stbtn"+(local?" on":""), (local?"☑ ":"☐ ")+i18n("локальный"));
    lb.title=i18n("Отдельный склад только для этого предмета (иначе — общий для всех)");
    lb.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); if(local) stockLocalOn.delete(id); else stockLocalOn.add(id); recompute(); };
    grp.appendChild(lb);
    const anyOn=filledIds.some((k)=>!sk[k].off);
    const me=el("button","sec-btn mini2 stbtn eyebtn"+(anyOn?"":" dim")); me.innerHTML=ICO_EYE; me.title=anyOn?i18n("Выключить весь склад"):i18n("Включить весь склад"); if(!nFilled) me.disabled=true;
    me.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); filledIds.forEach((k)=>{ sk[k].off=anyOn; }); recompute(); };
    grp.appendChild(me);
    const clr=el("button","sec-btn mini2 stbtn", i18n("Очистить")); if(!nFilled) clr.disabled=true;
    clr.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); confirmModal(i18n("Очистить весь склад?"), ()=>{ for(const k in sk) delete sk[k]; recompute(); }); };
    grp.appendChild(clr);
    sum.appendChild(grp);
    det.appendChild(sum);
    const tbl=el("table","stocktbl fixed");
    const cg=el("colgroup"); ["40px","206px","116px","132px","182px"].forEach((w)=>{ const c=el("col"); c.style.width=w; cg.appendChild(c); }); tbl.appendChild(cg);
    const thr=el("tr"); ["", i18n("Ресурс"), i18n("Заметка"), i18n("Кол-во"), i18n("Действия")].forEach((hh,ci)=> thr.appendChild(el("th",(ci===3?"ar":""), hh)));
    const thd=el("thead"); thd.appendChild(thr); tbl.appendChild(thd);
    const tb=el("tbody"); tbl.appendChild(tb);
    // сортировка: need=demand / name / have=ВВЕДЁННОЕ кол-во (НЕ stockQty: тот даёт 0 для off → глазик «выкл всё» менял бы порядок); dir −1=убыв.; tie→имя
    const hv=(it)=>{ const e=sk[it]; return e?(e.inf?1e15:(+e.qty||0)):0; };
    const stockCmp=(a,b)=>{ const v=_stockView, nm=ty(a).name.localeCompare(ty(b).name);
      if(v.by==="name") return nm*v.dir;
      const ka=v.by==="have"?hv(a):(demand[a]||0), kb=v.by==="have"?hv(b):(demand[b]||0);
      return (ka-kb)*v.dir || nm; };
    let _zi=0;
    const addRows=(arr)=> arr.forEach((it)=>{ const r=srow(it); if(_zi++%2) r.classList.add("zeb"); tb.appendChild(r); });
    // глубина переработки (этапы от сырья): руда/лут=0, рефайн из руды=1, крафт=2… max по recipeOk-рецептам; локальный мемо + cycle-гард
    const _dm={};
    const itemDepth=(it)=>{ if(it in _dm) return _dm[it]; if(!isCraftable(it)) return _dm[it]=0; _dm[it]=0; let mx=0; (byOut[it]||[]).forEach((r)=>{ if(!recipeOk(r)) return; (r.inp||[]).forEach((i)=>{ const di=itemDepth(i.id); if(di>mx) mx=di; }); }); return _dm[it]=mx+1; };
    // блок группы: кликабельный заголовок (свернуть/развернуть) + счётчик + каретка; lbl УЖЕ переведён; ключи свёртки tN/lN/c:cat/fN
    const grpBlock=(key, lbl, items)=>{
      const col=_stockCollapsed.has(key);
      const gtr=el("tr","stockgrp"+(col?" col":"")); const gtd=el("td","sgrp"); gtd.colSpan=5;
      gtd.appendChild(el("span","gcar", col?"▸":"▾"));
      gtd.appendChild(el("span","glbl", lbl+" ("+items.length+")"));
      gtr.appendChild(gtd);
      gtr.onclick=()=>{ if(col) _stockCollapsed.delete(key); else _stockCollapsed.add(key); recompute(); };
      tb.appendChild(gtr);
      if(!col) addRows(items);
    };
    const gm=_stockView.group;
    if(gm==="type"){
      [[2,"Крафт"],[1,"Рефайн"],[0,"Руда"]].forEach(([g,lbl])=>{   // обратный порядок: готовые материалы сверху, руда внизу
        const items=res.filter((it)=>grpOf(it)===g).sort(stockCmp);
        if(items.length) grpBlock("t"+g, i18n(lbl), items);
      });
    } else if(gm==="level"){   // по глубине переработки — больше этапов (готовые «кирпичи») сверху, сырьё внизу
      [...new Set(res.map(itemDepth))].sort((a,b)=>b-a).forEach((dp)=>{
        const items=res.filter((it)=>itemDepth(it)===dp).sort(stockCmp);
        if(items.length) grpBlock("l"+dp, i18n("Уровень {n}",{n:dp}), items);
      });
    } else if(gm==="cat"){   // по SDE-категории (Asteroid/Material/Commodity…), порядок как в сайдбаре
      [...new Set(res.map((it)=>ty(it).cat))].sort((a,b)=>CAT_ORDER.indexOf(a)-CAT_ORDER.indexOf(b)).forEach((c)=>{
        const items=res.filter((it)=>ty(it).cat===c).sort(stockCmp);
        if(items.length) grpBlock("c:"+c, i18n(c), items);
      });
    } else if(gm==="filled"){
      const isF=(it)=>{ const e=sk[it]; return !!(e&&(e.qty>0||e.inf)); };
      [["Заполнено",true],["Пусто",false]].forEach(([lbl,f])=>{
        const items=res.filter((it)=>isF(it)===f).sort(stockCmp);
        if(items.length) grpBlock("f"+(f?1:0), i18n(lbl), items);
      });
    } else { addRows(res.slice().sort(stockCmp)); }   // none — плоский список
    det.appendChild(tbl);
    guide.appendChild(det);

    function srow(it){
      const e=sk[it], inf=!!(e&&e.inf), q=(e&&e.qty>0)?e.qty:0, has=(q>0||inf), off=!!(has&&e.off);
      const tr=el("tr","strow"+(has?" has":"")+(off?" off":""));
      const ci=el("td","sic"); ci.onclick=()=>showDetail(it); ci.appendChild(icon(it,28)); tr.appendChild(ci);
      tr.appendChild(el("td","snm", esc(ty(it).name)));
      const ct=el("td","scm"+(has?" editable":"")+((has&&e.comment)?"":" muted"), (has&&e.comment)?esc(e.comment):"—"); if(has){ ct.title=i18n("Кликни — заметка"); ct.onclick=()=>edit(ct,it,"comment"); } tr.appendChild(ct);
      const qt=el("td","sqty ar editable"+(inf?" infv":(q?"":" muted")), inf?"∞":(q?num(q):"—")); qt.title=i18n("Кликни — вписать количество"); qt.onclick=()=>edit(qt,it,"qty"); tr.appendChild(qt);
      const act=el("td","sact");
      act.appendChild(actBtn("∞", inf?i18n("Снять «бесконечно»"):i18n("Бесконечно (не добывать)"), ()=>toggleInf(it), "inf"+(inf?" on":"")));
      if(has){
        if(!inf) act.appendChild(actBtn(ICO_EDIT, i18n("Изменить количество"), ()=>edit(qt,it,"qty"), "ed"));
        act.appendChild(actBtn(ICO_EYE, off?i18n("Включить"):i18n("Отключить"), ()=>{ e.off=!e.off; recompute(); }, "eye"+(off?" eyeoff":"")));
        act.appendChild(actBtn(ICO_DEL, i18n("Удалить"), ()=>{ confirmModal(i18n("Убрать «{name}» из склада?",{name:ty(it).name}), ()=>{ delete sk[it]; recompute(); }); }, "del"));
      }
      tr.appendChild(act);
      return tr;
    }
    function toggleInf(it){ const e=sk[it]; if(e){ e.inf=!e.inf; if(!e.inf && !(e.qty>0)) delete sk[it]; } else sk[it]={qty:0, comment:"", off:false, inf:true, ord:(Object.values(sk).reduce((m,x)=>Math.max(m,x.ord||0),0)+1)}; recompute(); }
    function actBtn(svg, title, fn, cls){ const b=el("button","sxb "+cls); b.innerHTML=svg; b.title=title; b.onclick=(ev)=>{ ev.stopPropagation(); fn(); }; return b; }
    function edit(td, it, field){
      if(td.querySelector("input")) return;
      const e=sk[it];
      const inp=el("input"); inp.className="sinline"+(field==="qty"?" ar":"");
      if(field==="qty"){ inp.type="number"; inp.min="0"; inp.value=(e&&e.qty>0)?String(e.qty):""; }
      else { inp.type="text"; inp.value=(e&&e.comment)||""; inp.placeholder=i18n("заметка"); }
      td.textContent=""; td.appendChild(inp); inp.focus(); if(field==="qty") inp.select();
      let done=false;
      const commit=()=>{ if(done) return; done=true;
        if(field==="qty"){ const v=parseInt(inp.value)||0;
          if(v>0){ if(sk[it]){ sk[it].qty=v; sk[it].inf=false; } else sk[it]={qty:v, comment:"", off:false, inf:false, ord:(Object.values(sk).reduce((m,x)=>Math.max(m,x.ord||0),0)+1)}; }
          else if(sk[it] && !sk[it].inf) delete sk[it];
        } else if(sk[it]) sk[it].comment=inp.value.trim();
        recompute();
      };
      inp.onblur=commit;
      inp.onkeydown=(ev)=>{ if(ev.key==="Enter") inp.blur(); else if(ev.key==="Escape"){ done=true; inp.onblur=null; showDetail(id); } };
    }
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
      const fac=planFacName(r);
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
      tr.appendChild(el("td","pfac",planFacName(r)||"—"));
      tb.appendChild(tr);
    });
    return el("thead",null,i18n("<tr><th>Из чего</th><th></th><th>Получаем</th><th class='ar'>Прогоны</th><th class='ar'>Время</th><th>Постройка</th></tr>"));
  });
  const dmemo={};
  const refineSteps=(steps||[]).filter((s)=>isRefineStepR(s.r)).sort((a,b)=>nodeDepth(a.id,dmemo)-nodeDepth(b.id,dmemo));
  const craftSteps =(steps||[]).filter((s)=>!isRefineStepR(s.r) && s.id!==LIST_ROOT).sort((a,b)=>nodeDepth(a.id,dmemo)-nodeDepth(b.id,dmemo));
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
    (id===LIST_ROOT
      ? i18n("Список: <b>{n} предметов</b> &nbsp;·&nbsp; ⛏ руда: <b>{ore} м³</b>", {n:listCount(), ore:num(rawVol)})
      : i18n("Цель: <b>{q} × {name}</b> &nbsp;·&nbsp; ⛏ руда: <b>{ore} м³</b>", {q:num(qty), name:esc(ty(id).name), ore:num(rawVol)})) +
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

