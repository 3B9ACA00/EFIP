// ── деталь предмета ──────────────────────────────────
function showDetail(id, qtyOverride){
  // при перерисовке того же предмета сохраняем введённое количество
  if(qtyOverride == null){
    const f = document.getElementById("qty");
    if(f && selected === id) qtyOverride = Math.max(1, parseInt(f.value)||1);
  }
  selected = id; fitMode = false;
  const wantHash = "#" + id + (qtyOverride > 1 ? ("x"+qtyOverride) : "");
  if(location.hash !== wantHash) location.hash = wantHash;   // ссылку можно скинуть другому игроку
  syncSidebarTo(id);
  const t = ty(id);
  const d = $("#detail"); d.innerHTML = "";

  const head = el("div","dhead");
  head.appendChild(icon(id,72));
  const ht = el("div");
  ht.appendChild(el("div","dname", esc(t.name)));
  ht.appendChild(el("div","dmeta",
    `<span class="badge">${esc(t.cat)}</span>` + (t.grp?`<span class="badge">${esc(t.grp)}</span>`:``) +
    i18n("объём {v} м³ · id {id}", {v:num(t.vol), id})));
  head.appendChild(ht);
  const lnk = el("button","sec-btn mini2 linkbtn",i18n("🔗 Поделиться"));
  lnk.onclick = ()=>{ navigator.clipboard.writeText(location.href).then(()=>{ lnk.textContent=i18n("✓ скопировано"); setTimeout(()=>lnk.textContent=i18n("🔗 Поделиться"),1600); }).catch(()=>{}); };
  head.appendChild(lnk);
  d.appendChild(head);

  const tabs = makeTabs(d);
  const recs = byOut[id] || [];
  let graphRes = null;
  // постройка: рецепты, которые в ней крутятся — вкладка добавляется НИЖЕ, после «Рецепт и план»
  const facRecs = facilityRecipes(t);

  // ── ТАБ 1: РЕЦЕПТ + ПЛАН (вместе, первым) ──
  const tMain = el("div");
  if(recs.length){
    const inp = el("input"); inp.type="number"; inp.min="1"; inp.id="qty";   // сколько произвести → драйвит план
    inp.value = (qtyOverride && qtyOverride > 1) ? String(qtyOverride) : "1";
    let run;
    tMain.appendChild(recipeBlock(recs, id, null));   // qty вынесен из строки результата в отдельный бар ниже
    // ── PRODUCE-бар: под рецептом (craft table), ПЕРЕД складом/планом; удобный ввод со степперами ──
    const pbar = el("div","producebar");
    pbar.appendChild(el("span","plabel", i18n("Произвести")));
    const pdec=el("button","pstep"); pdec.type="button"; pdec.textContent="−"; pdec.onclick=()=>{ inp.value=Math.max(1,(parseInt(inp.value)||1)-1); run(); };
    pbar.appendChild(pdec); pbar.appendChild(inp);
    const pinc=el("button","pstep"); pinc.type="button"; pinc.textContent="+"; pinc.onclick=()=>{ inp.value=(parseInt(inp.value)||1)+1; run(); };
    pbar.appendChild(pinc); pbar.appendChild(el("span","punit", i18n("шт")));
    tMain.appendChild(pbar);
    const psec = el("div","sec");
    const res = el("div"); res.id="planres"; psec.appendChild(res);   // постройки считаем доступными (фильтр убран)
    graphRes = el("div");
    tMain.appendChild(psec);
    run = ()=>{
      const q = Math.max(1, parseInt(inp.value)||1);
      const wh = "#"+id+(q>1?("x"+q):"");
      if(location.hash !== wh) history.replaceState(null, "", wh);  // qty в ссылке
      renderPlan(id, q, res);
      renderGraph(id, q, graphRes);
    };
    let _t; inp.oninput = ()=>{ clearTimeout(_t); _t=setTimeout(run, 300); };
    tabs.add(i18n("Рецепт и план"), tMain);   // без tabhead — имя таба достаточно
    run();
  } else {
    const mined = asteroidYieldsOre(t);   // это астероид-камень (Char/Slag/…) → даёт руду
    if(mined.length){
      tMain.appendChild(el("div","note", i18n("🪨 Астероид — добывается майнингом, даёт руду.")));
      tMain.appendChild(el("div","tabhead", i18n("⛏ Что добывается")));
      const g = el("div","chiprow"); mined.forEach((o)=> g.appendChild(oreChip(o.id))); tMain.appendChild(g);
    } else {
      tMain.appendChild(el("div","note", isLoot(id) ? i18n("🎁 Лут — не добывается, выпадает (salvage/дроп).") : i18n("⛏ Руда — добывается майнингом.")));
      const from = minedFromAsteroid(t);   // руда → из какого астероида копается
      if(from.length){ const fr=el("div","minedrow"); fr.appendChild(el("span","mlabel", i18n("Добывается из:"))); from.forEach((a)=> fr.appendChild(oreChip(a.id))); tMain.appendChild(fr); }
      const rep = reprocessBlock(t);   // если руда/лут рефайнится — полный рецепт переработки
      if(rep){ tMain.appendChild(el("div","tabhead", i18n("♨ Переработка"))); tMain.appendChild(rep); }
    }
    tabs.add(i18n("Сырьё"), tMain);
  }

  // ── постройка: что в ней производится (рефайн/крафт) — ПОСЛЕ «Рецепт и план» ──
  if(facRecs) tabs.add(i18n("Рецепты здесь"), facRecs, i18n("Что производится в постройке"));

  // ── ТАБ 2: Характеристики ──
  tabs.add(i18n("Характеристики"), charsPanel(t), i18n("Характеристики"));

  // ── ТАБ 3: Связи (переработка / совместимость / производство / используется) ──
  const tRel = el("div");
  const refine = refineIn(t); if(refine) tRel.appendChild(refine);
  const compat = compatSection(t); if(compat) tRel.appendChild(compat);
  // (рецепты постройки — отдельной вкладкой «Рецепты здесь»)
  const eng = engineCompare(t); if(eng) tRel.appendChild(eng);
  const fuel = fuelCompare(t); if(fuel) tRel.appendChild(fuel);
  const fuelEng = fuelEngines(t); if(fuelEng) tRel.appendChild(fuelEng);
  const used = (byInput[id] || []).filter((r)=> !(r.fac||[]).some((f)=>REFINERIES.has(f)));  // переработку показываем отдельно (refineIn)
  if(used.length){
    const outs = []; const seen = new Set();
    used.forEach((r)=> r.out.forEach((o)=>{ if(o.id!==id && !seen.has(o.id)){ seen.add(o.id); outs.push(o.id); } }));
    if(outs.length){
      const sec = el("details","sec foldsec"); sec.open = true; sec.appendChild(el("summary",null,i18n("Используется в крафте ({n})", {n:outs.length})));
      outs.sort((a,b)=> ty(a).name.localeCompare(ty(b).name)).forEach((oid)=>{
        const li = el("div","li"); li.style.cursor="pointer";
        li.appendChild(icon(oid,30));
        li.appendChild(el("span","nm",esc(ty(oid).name)));
        li.onclick=()=>showDetail(oid);
        sec.appendChild(li);
      });
      tRel.appendChild(sec);
    }
  }
  if(tRel.children.length) tabs.add(i18n("Связи"), tRel, i18n("Связи"));

  // ── ТАБ 4: Граф производства (custom SVG) ──
  if(recs.length) tabs.add(i18n("Граф"), graphRes, i18n("Граф производства"));
  // ── Flow2 / Flow3 — эксперименты на vanilla-библиотеках (ленивый рендер при открытии) ──
  if(recs.length){
    const fq = ()=> Math.max(1, parseInt((document.getElementById("qty")||{}).value)||1);
    tabs.add("Flow5", (panel)=>{ const h=el("div"); panel.appendChild(h); renderD3(id, fq(), h); }, "Flow5 · D3 force-directed");
    tabs.add("Flow6", (panel)=>{ const h=el("div"); panel.appendChild(h); renderCyto(id, fq(), h, {layout:"dagre", compound:true}); }, "Flow6 · Cytoscape dagre + этапы");
  }

  if(tabs.count() <= 1) tabs.bar.style.display = "none";
  tabs.activate(Math.min(detailTab||0, tabs.count()-1));
  d.scrollTop = 0;
}
// ── рецепт таблицей: [подпись] + [содержимое]; постройка(=переключатель пути) / ингредиенты / результат ──
function recipeBlock(recs, mainId, qtyInput){
  let sel = Math.min(pathIdx(mainId), recs.length-1);
  if(!recipeOk(recs[sel])){ const u=recs.findIndex(recipeOk); if(u>=0) sel=u; }   // запрещённый (лут/не-Refinery) не показываем по умолчанию
  const r = recs[sel], best = bestIdx(mainId);
  const okIdx = recs.map((rr,i)=> recipeOk(rr)?i:-1).filter((i)=>i>=0);   // индексы пригодных рецептов
  const wrap = el("div","rblock");
  const row = (label, kids)=>{
    wrap.appendChild(el("div","rrlabel", esc(label)));
    const c = el("div","rrcontent"); kids.forEach((k)=> k && c.appendChild(k)); wrap.appendChild(c);
  };
  // строка 1 — ВЫБОР ВАРИАНТА рецепта (если пригодных >1): чип на рецепт, отличаются ГЛАВНЫМ ВХОДОМ
  // (постройки часто совпадают → старый переключатель по постройкам их не различал и показывал один).
  if(okIdx.length > 1){
    const varKids = okIdx.map((i)=>{
      const rr = recs[i], active = (i===sel), inp = (rr.inp||[])[0], fac = (rr.fac||[])[0];
      const vc = el("div","rfacchip rvar"+(active?" on":"")+(i===best?" best":""));
      vc.style.cursor = active ? "default" : "pointer";
      if(inp) vc.appendChild(icon(inp.id,26));
      vc.appendChild(el("span","rfacnm", esc(inp?ty(inp.id).name:"—")+" · "+num(outQty(rr,mainId))+"×"));
      if(fac!=null) vc.appendChild(icon(fac,18));
      vc.title = active ? i18n("текущий вариант") : i18n("Выбрать этот вариант");
      if(!active) vc.onclick = ()=>{ userPath[mainId]=i; showDetail(mainId); };
      return vc;
    });
    row(i18n("Вариант рецепта"), varKids);
  } else {
    const facs = [...new Set(r.fac||[])].sort((a,b)=>ty(a).name.localeCompare(ty(b).name));
    let facKids;
    if(facs.length) facKids = facs.map((f)=>{ const fc=el("div","rfacchip on"); fc.appendChild(icon(f,28)); fc.appendChild(el("span","rfacnm", esc(ty(f).name))); return fc; });
    else if(r.build){ const fc=el("div","rfacchip on bmode"); fc.appendChild(el("span","rfacnm","Build Mode [B]")); facKids=[fc]; }  // постройка (base building) — нет industry-facility
    else facKids = [el("span","note","—")];
    row(i18n("Постройка"), facKids);
  }
  // строка 2 — ингредиенты (плитки одинакового размера)
  const ingKids = r.inp.length ? r.inp.map((i)=> rtile(i.id, i.q, ""))
                               : [el("span","note", i18n("без ингредиентов"))];
  row(i18n("Ингредиенты"), ingKids);
  // строка 3 — результат + время + сколько произвести
  const outKids = r.out.map((o)=> rtile(o.id, o.q, o.id===mainId ? "prim" : "bp"));
  outKids.push(el("span","rtime", "⏱ "+fmtTime(r.rt)));
  if(qtyInput){ const qb = el("label","rqty"); qb.appendChild(el("span",null, i18n("произвести:"))); qb.appendChild(qtyInput); outKids.push(qb); }
  row(i18n("Результат"), outKids);
  return wrap;
}
// плитка предмета: [иконка + имя] сверху, количество — в тёмном подвале (крупно, по центру)
function rtile(id, q, cls){
  const tile = el("div","rtile"+(cls?(" "+cls):"")); tile.style.cursor="pointer";
  const top = el("div","rtop");
  top.appendChild(icon(id,64));            // полный нативный размер иконки (исходник 64×64)
  top.appendChild(el("div","rnm", esc(ty(id).name)));
  tile.appendChild(top);
  tile.appendChild(el("div","rqf", num(q)+"×"));
  tile.onclick=()=>showDetail(id);
  return tile;
}
// ── блок переработки руды/лута: рефайнилка(переключатель партии) → N× исходник → материалы с количеством + время ──
function reprocessBlock(t){
  const rr = (byInput[t.id] || []).filter((r)=> (r.fac||[]).some((f)=>REFINERIES.has(f)));
  if(!rr.length) return null;
  const sel = Math.min(reprocPath[t.id]||0, rr.length-1);
  const r = rr[sel];
  const wrap = el("div","rblock");
  const row = (label, kids)=>{ wrap.appendChild(el("div","rrlabel", esc(label))); const c=el("div","rrcontent"); kids.forEach((k)=>k&&c.appendChild(k)); wrap.appendChild(c); };
  // строка 1 — рефайнилка (переключатель: рецепты отличаются размером партии)
  const facChips = rr.map((rec,i)=>{
    const f = (rec.fac||[]).find((x)=>REFINERIES.has(x)); const active = i===sel;
    const fc = el("div","rfacchip"+(active?" on":"")); fc.style.cursor = active?"default":"pointer";
    fc.appendChild(icon(f,28)); fc.appendChild(el("span","rfacnm", esc(ty(f).name)));
    fc.title = active ? i18n("текущий путь") : i18n("Выбрать этот путь");
    if(!active) fc.onclick = ()=>{ reprocPath[t.id]=i; showDetail(t.id); };
    return fc;
  });
  row(i18n("Постройка"), facChips);
  // строка 2 — что перерабатываем (партия)
  const inSelf = r.inp.find((x)=>x.id===t.id) || r.inp[0];
  row(i18n("Перерабатываем"), [rtile(t.id, inSelf.q, "")]);
  // строка 3 — что получаем (материалы с количеством) + время
  const outKids = r.out.filter((o)=>o.id!==t.id).map((o)=> rtile(o.id, o.q, "bp"));
  outKids.push(el("span","rtime", "⏱ "+fmtTime(r.rt)));
  row(i18n("Получаем"), outKids);
  return wrap;
}
// ── связь астероид↔руда (по имени группы: «X» ↔ «X Ores») ──
function asteroidYieldsOre(t){ if(t.cat!=="Asteroid" || / Ores$/.test(t.grp)) return []; return DATA.types.filter((x)=> x.grp===t.grp+" Ores"); }
function minedFromAsteroid(t){ if(t.cat!=="Asteroid" || !/ Ores$/.test(t.grp)) return []; const g=t.grp.replace(/ Ores$/,""); return DATA.types.filter((x)=> x.grp===g); }
function oreChip(oid){ const c=el("div","reschip"); c.style.cursor="pointer"; c.onclick=()=>showDetail(oid); c.appendChild(icon(oid,30)); c.appendChild(el("span",null," "+esc(ty(oid).name))); return c; }
// ── где переработать: рефайнилки, в которых этот предмет — вход (reprocessing) ──
function refineIn(t){
  const rr = (byInput[t.id] || []).filter((r)=> (r.fac||[]).some((f)=>REFINERIES.has(f)));
  if(!rr.length) return null;
  const facs = [...new Set(rr.flatMap((r)=> (r.fac||[]).filter((f)=>REFINERIES.has(f))))].sort((a,b)=>ty(a).name.localeCompare(ty(b).name));
  const outs = [...new Set(rr.flatMap((r)=> r.out.map((o)=>o.id)))].filter((o)=>o!==t.id);
  const sec = el("details","sec foldsec"); sec.open = true;
  sec.appendChild(el("summary",null, i18n("♨ Где переработать ({n})", {n:facs.length})));
  const grid = el("div","compatgrid");
  facs.forEach((f)=>{ const li=el("div","cmpli"); li.style.cursor="pointer"; li.onclick=()=>showDetail(f);
    li.appendChild(icon(f,24)); li.appendChild(el("span",null," "+esc(ty(f).name))); grid.appendChild(li); });
  sec.appendChild(grid);
  if(outs.length) sec.appendChild(el("div","note", i18n("→ даёт: ")+outs.slice(0,16).map((o)=>esc(ty(o).name)).join(", ")));
  return sec;
}
// ── рецепты, которые выполняются в этой постройке (рефайн/крафт): из чего → получаем ──
function facilityRecipes(t){
  let here = DATA.recipes.filter((r)=> (r.fac||[]).includes(t.id));
  if(!here.length){   // construction-site деплой имеет др. id — ищем рабочую постройку по имени
    const facIds = [...new Set(DATA.recipes.flatMap((r)=> r.fac||[]))];
    const m = facIds.find((f)=> ty(f).name===t.name && f!==t.id);
    if(m) here = DATA.recipes.filter((r)=> (r.fac||[]).includes(m));
  }
  if(!here.length) return null;
  here = here.slice().sort((a,b)=> ty(a.out[0].id).name.localeCompare(ty(b.out[0].id).name));
  const wrap = el("div");
  wrap.appendChild(el("div","note", i18n("Рецептов: {n}", {n:here.length})));
  const chip = (id,q)=>{ const c=el("span","reschip"); c.style.cursor="pointer"; c.onclick=()=>showDetail(id);
    c.appendChild(icon(id,26)); c.appendChild(el("span",null," "+num(q)+"× "+esc(ty(id).name))); return c; };
  const tbl = el("table","plantbl"); const tb = el("tbody");
  here.forEach((r)=>{
    const tr=el("tr","prow");
    const cf=el("td","pfrom2"); r.inp.forEach((i)=> cf.appendChild(chip(i.id,i.q))); tr.appendChild(cf);
    tr.appendChild(el("td","parrow","→"));
    const ct=el("td","pto"); r.out.forEach((o)=> ct.appendChild(chip(o.id,o.q))); tr.appendChild(ct);
    tr.appendChild(el("td","ptime", fmtTime(r.rt)));
    tb.appendChild(tr);
  });
  tbl.appendChild(el("thead",null, i18n("<tr><th>Из чего</th><th></th><th>Получаем</th><th class='ar'>Время</th></tr>")));
  tbl.appendChild(tb); wrap.appendChild(tbl);
  return wrap;
}

function cellQty(x, prim){
  const s = el("span","cell"+(prim?" prim":""));
  s.appendChild(el("b",null, num(x.q)+" "));
  s.appendChild(icon(x.id,20));
  s.appendChild(document.createTextNode(" "+ty(x.id).name));
  return s;
}
// Таблица путей (вариантов рецепта): выбор · постройка · вход · выход · время. Клик по строке — выбрать путь.
function recipesTable(recs, mainId){
  const cur = Math.min(pathIdx(mainId), recs.length-1);
  const best = bestIdx(mainId);
  const tbl = el("table","ptbl");
  tbl.appendChild(el("thead",null,i18n("<tr><th></th><th>Постройка</th><th>Нужно (вход)</th><th>Даёт (выход)</th><th>Сырьё/шт</th><th>Время</th></tr>")));
  const tb = el("tbody");
  recs.forEach((r,i)=>{
    const tr = el("tr","ptr"+(i===cur?" on":"")+(i===best?" best":""));
    const pick = el("td","c-pick"); pick.textContent = i===cur ? "●" : "○"; tr.appendChild(pick);
    const cf = el("td","c-fac");
    (r.fac||[]).forEach((f)=> cf.appendChild(icon(f,18)));
    cf.appendChild(el("span","fnm", " "+((r.fac||[]).map((f)=>ty(f).name).join(", ") || "—")));
    tr.appendChild(cf);
    const ci = el("td","c-in"); r.inp.forEach((x)=> ci.appendChild(cellQty(x,false))); tr.appendChild(ci);
    const co = el("td","c-out");
    r.out.forEach((o)=>{ const c=cellQty(o, o.id===mainId); if(r.out.length>1 && o.id!==mainId) c.appendChild(el("span","bptag",i18n("поб."))); co.appendChild(c); });
    tr.appendChild(co);
    const uc = recipeUnitCost(r, mainId);
    const cv = el("td","c-vol");
    let s = `${num(uc.ore)} ${i18n("м³")}`;
    if(uc.loot > 0) s += ` <span class="loottag">${i18n("+{n} лут", {n:num(uc.loot)})}</span>`;
    if(i===best) s += ` <span class="besttag">${i18n("✓ выгодно")}</span>`;
    cv.innerHTML = s;
    tr.appendChild(cv);
    tr.appendChild(el("td","c-time", fmtTime(r.rt)));
    tr.onclick = ()=>{ userPath[mainId]=i; showDetail(mainId); };
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  return tbl;
}

function recipeCard(r, mainId){
  const c = el("div","recipe");
  // выходы (multi-output): основной + побочные
  for(const o of r.out){
    const row = el("div","out"+(o.id===mainId?" prim":""));
    row.appendChild(icon(o.id,36));
    row.appendChild(el("span",null,`${num(o.q)} × ${esc(ty(o.id).name)}`));
    if(r.out.length>1 && o.id!==mainId) row.appendChild(el("span","bptag",i18n("побочный")));
    row.style.cursor="pointer"; row.onclick=()=>showDetail(o.id);
    c.appendChild(row);
  }
  c.appendChild(el("div","rt",i18n("время: ")+fmtTime(r.rt)));
  c.appendChild(el("div","arrow",i18n("← требуется:")));
  for(const i of r.inp){
    const row = el("div","ing");
    row.appendChild(el("span","q", num(i.q)));
    row.appendChild(icon(i.id,34));
    row.appendChild(el("span","nm", esc(ty(i.id).name)));
    if(!isCraftable(i.id)) row.appendChild(el("span","raw",i18n("сырьё")));
    row.style.cursor="pointer"; row.onclick=()=>showDetail(i.id);
    c.appendChild(row);
  }
  if(r.fac && r.fac.length){
    const f = el("div","facrow");
    f.appendChild(el("span","faclbl",i18n("🏭 производится в:")));
    for(const fid of r.fac){
      const chip = el("span","facchip");
      chip.appendChild(icon(fid,18)); chip.appendChild(el("span",null," "+esc(ty(fid).name)));
      chip.onclick=()=>showDetail(fid); f.appendChild(chip);
    }
    c.appendChild(f);
  }
  return c;
}

