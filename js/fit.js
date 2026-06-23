// ── фиттинг: слоты корабля → что можно поставить ─────
const SLOT_LABEL = {
  hi:"⚔ Hi — оружие / добыча", med:"🛡 Med — щиты / варп", low:"🔧 Low — защита / карго",
  engine:"🚀 Engine — движки", turret:"🎯 Turret — точки турелей", launcher:"🎇 Launcher — точки ракет",
};
// модуль подходит кораблю: нет ограничений ИЛИ группа корабля в canFitShipGroup модуля
const modFits = (mid, gid)=>{ const m = ty(mid); return !(m.fit && m.fit.length) || m.fit.includes(gid); };
// колонки сравнения по типу слота: [attr, label]
const SLOT_COLS = {
  hi:     [['power','PG'],['cpu','CPU'],['capacitorNeed','Cap'],['maxRange','Дальн.'],['damageMultiplier','Урон×'],['trackingSpeed','Трек.']],
  med:    [['power','PG'],['cpu','CPU'],['capacitorNeed','Cap'],['duration','Длит.'],['maxRange','Дальн.'],['signatureEm','Сигн.']],
  low:    [['power','PG'],['cpu','CPU'],['armorHPBonusAdd','Броня+'],['kineticDamageResistanceBonus','Kin'],['thermalDamageResistanceBonus','Therm'],['capacityBonus','Карго+']],
  engine: [['power','PG'],['cpu','CPU'],['warpFuelRate','Варп-топл.'],['signatureEm','Сигн.'],['rechargeRate','Кап-рег.']],
};
const LOWER_BETTER = new Set(['power','cpu','capacitorNeed','signatureEm','reloadTime','warpFuelRate','fuelRate','duration']);
// сравнительная таблица модулей одного слота: Модуль · Группа · колонки характеристик (лучшее — зелёным)
function slotTable(mods, slot){
  const cols = SLOT_COLS[slot] || [['power','PG'],['cpu','CPU']];
  const tbl = el("table","ptbl slottbl");
  let thh = i18n("<tr><th>Модуль</th><th>Группа</th>");
  for(const c of cols) thh += "<th>"+i18n(c[1])+"</th>";
  tbl.appendChild(el("thead",null, thh+"</tr>"));
  const best = {};
  for(const c of cols){
    const a = c[0];
    const vals = mods.map((m)=>(ty(m).attrs||{})[a]).filter((v)=>v!=null);
    if(vals.length) best[a] = LOWER_BETTER.has(a) ? Math.min(...vals) : Math.max(...vals);
  }
  const tb = el("tbody");
  mods.forEach((mid)=>{
    const m = ty(mid), at = m.attrs||{};
    const tr = el("tr"); tr.style.cursor="pointer"; tr.onclick=()=>showDetail(mid);
    const c0 = el("td","engnm"); c0.appendChild(icon(mid,18)); c0.appendChild(el("span",null," "+esc(m.name))); tr.appendChild(c0);
    tr.appendChild(el("td","slotgrp", esc(m.grp||"")));
    for(const c of cols){
      const v = at[c[0]];
      const td = el("td", (v!=null && v===best[c[0]]) ? "best" : null);
      td.textContent = v!=null ? num(v) : "—"; tr.appendChild(td);
    }
    tb.appendChild(tr);
  });
  tbl.appendChild(tb); return tbl;
}
function fittingTable(t){
  const sec = el("details","sec foldsec"); sec.open = true;
  sec.appendChild(el("summary",null,i18n("🔧 Слоты и модули — что можно поставить (фит)")));
  const gid = t.gid;
  const tbl = el("table","ptbl fittbl");
  tbl.appendChild(el("thead",null,i18n("<tr><th>Слот</th><th>Шт</th><th>Что подходит</th></tr>")));
  const tb = el("tbody");
  ["hi","med","low","engine","turret","launcher"].forEach((k)=>{
    const n = t.slots[k]; if(!n) return;
    const tr = el("tr");
    tr.appendChild(el("td","slotname", i18n(SLOT_LABEL[k]||k)));
    tr.appendChild(el("td","slotn", String(n)));
    const td = el("td","slotmods");
    if(k==="turret" || k==="launcher"){
      td.appendChild(el("span","note",i18n("точки для оружия (модули из Hi)")));
    } else {
      const mods = (modsBySlot[k]||[]).filter((mid)=>modFits(mid,gid)).sort((a,b)=>ty(a).name.localeCompare(ty(b).name));
      if(!mods.length){ td.appendChild(el("span","note","—")); }
      else { const box = el("div","slotscroll"); box.appendChild(slotTable(mods, k)); td.appendChild(box); }
    }
    tr.appendChild(td); tb.appendChild(tr);
  });
  tbl.appendChild(tb); sec.appendChild(tbl);
  sec.appendChild(el("div","note",i18n("Совместимость по группе корабля (canFitShipGroup). Расход PG/CPU — в фитилке выше.")));
  return sec;
}

// ── фитилка (конструктор фита) ───────────────────────
function initFit(t){
  if(!fitState || fitState.shipId !== t.id){
    fitState = { shipId:t.id, slots:{} };
    for(const k of ['hi','med','low','engine']) fitState.slots[k] = new Array((t.slots||{})[k]||0).fill(null);
  }
}
function fitChosen(){
  const out=[]; if(!fitState) return out;
  for(const k in fitState.slots) for(const mid of fitState.slots[k]) if(mid) out.push(mid);
  return out;
}
function resBar(label, use, max){
  const over = use > max + 1e-9;
  const d = el("div","resbar"+(over?" over":""));
  d.appendChild(el("span","rblbl", `${label}: ${num(use)} / ${num(max)}` + (over?i18n("  ⚠ превышение!"):"")));
  const track = el("div","rbtrack"); const fill = el("div","rbfill");
  fill.style.width = Math.min(100, max ? use/max*100 : 0) + "%";
  track.appendChild(fill); d.appendChild(track);
  return d;
}
function fitRawTotals(ids){
  const raw = {};
  for(const id of ids){ const r = plan(id, 1).raw; for(const k in r) raw[k] = (raw[k]||0) + r[k]; }
  let ore=0, loot=0;
  for(const k in raw){ const v = ty(+k).vol||0; if(isLoot(+k)) loot += v*raw[k]; else ore += v*raw[k]; }
  return { raw, ore, loot };
}
function renderFitSummary(t, host){
  host.innerHTML = "";
  const chosen = fitChosen();
  const a = t.attrs||{};
  const pgUse = chosen.reduce((s,mid)=>s+((ty(mid).attrs||{}).power||0), 0);
  const cpuUse = chosen.reduce((s,mid)=>s+((ty(mid).attrs||{}).cpu||0), 0);
  host.appendChild(resBar("PG (powergrid)", pgUse, a.powerOutput||0));
  host.appendChild(resBar("CPU", cpuUse, a.cpuOutput||0));
  const tot = fitRawTotals([t.id, ...chosen]);
  const cost = el("div","fitcost");
  cost.innerHTML = i18n("Стоимость фита (корабль + {n} мод.): ⛏ руда <b>{ore} м³</b>", {n:chosen.length, ore:num(tot.ore)}) +
    (tot.loot>0 ? i18n(" · 🎁 лут <b>{loot} м³</b>", {loot:num(tot.loot)}) : "") + i18n(" · видов сырья <b>{n}</b>", {n:Object.keys(tot.raw).length});
  host.appendChild(cost);
}
function fitPanel(t){
  initFit(t);
  const gid = t.gid;
  const sec = el("details","sec foldsec"); sec.open = true;
  sec.appendChild(el("summary",null,i18n("🛠 Фитилка — собрать корабль")));
  const grid = el("div","fitgrid");
  const sumHost = el("div","fitsum");
  for(const k of ['hi','med','low','engine']){
    const n = (t.slots||{})[k]||0; if(!n) continue;
    const opts = (modsBySlot[k]||[]).filter((mid)=>modFits(mid,gid)).sort((a,b)=>ty(a).name.localeCompare(ty(b).name));
    for(let i=0;i<n;i++){
      const row = el("div","fitslot");
      row.appendChild(el("span","fitslotlbl", ({hi:'Hi',med:'Med',low:'Low',engine:'Eng'}[k]||k)+" "+(i+1)));
      const sel = el("select");
      sel.appendChild(new Option(i18n("— пусто —"),""));
      opts.forEach((mid)=>{ const o=new Option(ty(mid).name, String(mid)); if(fitState.slots[k][i]===mid) o.selected=true; sel.appendChild(o); });
      const ii=i, kk=k;
      sel.onchange = ()=>{ fitState.slots[kk][ii] = sel.value ? +sel.value : null; renderFitSummary(t, sumHost); };
      row.appendChild(sel);
      grid.appendChild(row);
    }
  }
  sec.appendChild(grid);
  sec.appendChild(sumHost);
  renderFitSummary(t, sumHost);
  sec.appendChild(el("div","note",i18n("Лимит PG/CPU корабля — главное ограничение фита. Бонусы модулей к ТТХ (HP/скорость/резисты) — следующий шаг.")));
  const openBtn = el("button","sec-btn openfit",i18n("⚙ Открыть фитинг (кольцо)"));
  openBtn.onclick = ()=> showFit(t.id);
  sec.appendChild(openBtn);
  return sec;
}

// ── фит-вил в стиле EVE: корабль в центре, слоты по дугам ──
const SLOT_SHORT = { hi:'Hi', med:'Med', low:'Low', engine:'Eng' };
const SECT_CENTER = { hi:270, med:0, low:90, engine:180 };  // верх / право / низ / лево (screen deg)
const SECT_SPAN   = { hi:90, med:70, low:104, engine:40 };
// характеристики корабля для панели фита
function shipStats(t){
  const a = t.attrs||{};
  const rows = [
    [i18n('🛡 HP корпус'), a.hp], [i18n('🩹 Броня'), a.armorHP], [i18n('🔵 Щит'), a.shieldCapacity],
    [i18n('🚀 Скорость'), a.maxVelocity, i18n('м/с')], [i18n('🌀 Варп'), a.warpSpeedMultiplier, '×'],
    [i18n('📡 Сигнатура'), a.signatureRadius, i18n('м')], [i18n('📦 Карго'), t.cargo, i18n('м³')],
    [i18n('⚡ Ёмкость кап.'), a.capacitorCapacity], [i18n('⛽ Бак топлива'), a.fuelCapacity],
    [i18n('🏋 Масса'), a.mass], [i18n('🎯 Манёвр (agility)'), a.agility],
  ];
  const box = el("div","statbox");
  box.appendChild(el("div","sbh",i18n("📊 Характеристики корабля")));
  const tbl = el("table","stattbl"); const tb = el("tbody");
  for(const [l,v,u] of rows){ if(v==null) continue; const tr=el("tr"); tr.appendChild(el("td","sl",l)); tr.appendChild(el("td","sv", num(v)+(u?(" "+u):""))); tb.appendChild(tr); }
  tbl.appendChild(tb); box.appendChild(tbl); return box;
}

// ── универсальный блок характеристик предмета (любой тип) ──
const ATTR_META = {
  hp:["HP корпуса"], armorHP:["HP брони"], shieldCapacity:["Ёмкость щита"],
  maxVelocity:["Скорость","м/с"], powerOutput:["PowerGrid"], cpuOutput:["CPU"],
  capacitorCapacity:["Ёмкость капаситора"], signatureRadius:["Сигнатура","м"],
  agility:["Инерция"], fuelCapacity:["Бак топлива"], warpSpeedMultiplier:["Скорость варпа","×"],
  power:["PowerGrid (расход)"], cpu:["CPU (расход)"], capacitorNeed:["Расход капаситора"],
  duration:["Длительность цикла","мс"], maxRange:["Дальность","м"], reloadTime:["Перезарядка","мс"],
  signatureEm:["Эмиссия сигнатуры"], rechargeRate:["Скор. восстановления"],
  warpFuelRate:["Расход топлива (варп)"], fuelRate:["Расход топлива"],
  damageMultiplier:["Множитель урона","×"], trackingSpeed:["Скорость наведения"],
  armorHPBonusAdd:["Бонус HP брони"], capacityBonus:["Бонус вместимости"], speedFactor:["Множитель скорости","×"],
  kineticDamageResistanceBonus:["Сопр. кинетике"], thermalDamageResistanceBonus:["Сопр. термал"],
  explosiveDamageResistanceBonus:["Сопр. взрыву"], emDamageResistanceBonus:["Сопр. EM"],
  fuelEfficiency:["КПД топлива"], fuelThermalInefficiency:["Тепл. потери"], fuelContainmentBurden:["Нагрузка хранения"],
};
const SLOT_RU = { low:"Low", med:"Med", hi:"High", launcher:"Launcher", turret:"Turret", engine:"Engine" };
const prettyKey = (k)=> k.replace(/([A-Z])/g," $1").replace(/^./,(c)=>c.toUpperCase()).trim();
function statTable(rows){
  const tbl=el("table","stattbl"); const tb=el("tbody");
  for(const [l,v,u] of rows){ if(v==null||v==="") continue;
    const tr=el("tr"); tr.appendChild(el("td","sl",l));
    tr.appendChild(el("td","sv",(typeof v==="number"?num(v):esc(v))+(u?(" "+u):""))); tb.appendChild(tr); }
  tbl.appendChild(tb); return tbl;
}
function charsPanel(t){
  const box = el("div","statbox charspanel");
  box.appendChild(el("div","sbh",i18n("📊 Характеристики")));
  const body = el("div","charbody"); box.appendChild(body);
  const sec = (title, rows)=>{ const rr = rows.filter(([,v])=>v!=null&&v!==""); if(!rr.length) return;
    const s=el("div","charsec"); s.appendChild(el("div","charsub",title)); s.appendChild(statTable(rows)); body.appendChild(s); };
  const base = [[i18n("Категория"), t.cat], [i18n("Группа"), t.grp||"—"], [i18n("Объём"), t.vol, i18n("м³")], [i18n("Масса"), t.mass, i18n("кг")]];
  if(t.cargo!=null) base.push([i18n("Карго"), t.cargo, i18n("м³")]);
  base.push(["typeID", String(t.id)]); if(t.gid!=null) base.push(["groupID", String(t.gid)]);
  sec(i18n("Общее"), base);
  if(t.slots) sec(i18n("Слоты"), Object.entries(t.slots).map(([k,v])=>[SLOT_RU[k]||k, v]));
  if(t.slot) sec(i18n("Слот"), [[i18n("Тип"), SLOT_RU[t.slot]||t.slot]]);
  if(t.attrs) sec(i18n("Атрибуты"), Object.entries(t.attrs).map(([k,v])=>{ const m=ATTR_META[k]; return [i18n(m?m[0]:prettyKey(k)), v, m&&i18n(m[1])]; }));
  return box;
}

// ── совместимость заряд ↔ модуль (СТРОГО из SDE) ──────────────────────
// module.cg = chargeGroup1..5 (groupID зарядов) из typeDogma SDE (export_data.py).
// Заряд подходит модулю ⇔ charge.gid ∈ module.cg. Никаких ручных карт.
const grpKey = (t)=> (t.grp||"").trim();
function compatBox(title, items){
  const sec = el("details","sec foldsec"); sec.open = true;
  sec.appendChild(el("summary",null,title));
  const grid = el("div","compatgrid");
  items.sort((a,b)=> grpKey(a).localeCompare(grpKey(b)) || a.name.localeCompare(b.name)).forEach((it)=>{
    const li = el("div","cmpli");
    li.appendChild(icon(it.id,30));
    li.appendChild(el("span","nm",esc(it.name)));
    li.appendChild(el("span","cgrp",esc(grpKey(it))));
    li.onclick = ()=>showDetail(it.id);
    grid.appendChild(li);
  });
  sec.appendChild(grid);
  return sec;
}
function compatSection(t){
  if(t.cat==="Charge"){
    const mods = DATA.types.filter((x)=>x.cat==="Module" && (x.cg||[]).includes(t.gid));
    return mods.length ? compatBox(i18n("🔧 Подходит к модулям ({n})", {n:mods.length}), mods) : null;
  }
  if(t.cat==="Module"){
    const cg = t.cg || [];
    if(!cg.length) return null;
    const charges = DATA.types.filter((x)=>x.cat==="Charge" && cg.includes(x.gid));
    return charges.length ? compatBox(i18n("🎯 Совместимые заряды ({n})", {n:charges.length}), charges) : null;
  }
  return null;
}
// ── что производится/перерабатывается в постройке ──
// Постройка ↔ facility по id ИЛИ по имени (деплой «Construction site» имеет др. typeID, чем рабочий facility).
function producedHere(t){
  if(!DATA.facilities) return null;
  const facIds = Object.keys(DATA.facilities).map(Number);
  let fid = DATA.facilities[t.id] ? t.id : facIds.find((f)=> ty(f).name === t.name);
  if(fid==null) return null;
  const recs = DATA.recipes.filter((r)=>(r.fac||[]).includes(fid));
  if(!recs.length) return null;
  const isRefine = REFINERIES.has(fid);
  const ids = isRefine
    ? [...new Set(recs.flatMap((r)=> r.inp.map((i)=>i.id)))]                              // что перерабатываем (руда/входы)
    : [...new Set(recs.map((r)=> r.prim || (r.out[0] && r.out[0].id)).filter(Boolean))]; // что создаём (выходы)
  if(!ids.length) return null;
  ids.sort((a,b)=> (catRank(ty(a).cat)-catRank(ty(b).cat)) || ty(a).name.localeCompare(ty(b).name));
  const sec = el("details","sec foldsec"); sec.open = true;
  sec.appendChild(el("summary",null, isRefine ? i18n("♨ Здесь можно переработать ({n})",{n:ids.length}) : i18n("🏭 Здесь создаётся ({n})",{n:ids.length})));
  const grid = el("div","compatgrid");
  ids.forEach((id)=>{
    const li = el("div","cmpli");
    li.appendChild(icon(id,30));
    li.appendChild(el("span","nm",esc(ty(id).name)));
    li.appendChild(el("span","cgrp",esc(ty(id).grp||"")));
    li.onclick = ()=>showDetail(id);
    grid.appendChild(li);
  });
  sec.appendChild(grid);
  return sec;
}
// ── шип → подходящие движки (сравнение) ──
function engineCompare(ship){
  if(ship.cat!=="Ship" || !(ship.slots && ship.slots.engine)) return null;
  const engs = (modsBySlot.engine||[]).filter((mid)=> modFits(mid, ship.gid));
  if(!engs.length) return null;
  const sec = el("details","sec foldsec"); sec.open = true;
  sec.appendChild(el("summary",null, i18n("🚀 Подходящие движки ({n})", {n:engs.length})));
  sec.appendChild(slotTable(engs, "engine"));
  return sec;
}
// ── движок → подходящее топливо (по группе: «X Engines» → «X Fuel») ──
function fuelCompare(engine){
  if(engine.slot!=="engine") return null;
  const fuelGrp = (engine.grp||"").replace(/Engines?$/i, "Fuel").trim();   // Crude Engines → Crude Fuel
  const fuels = DATA.types.filter((t)=> grpKey(t)===fuelGrp);
  if(!fuels.length) return null;
  const COLS = [
    {k:"fuelEfficiency", lbl:"КПД топлива", dir:"max"},
    {k:"fuelThermalInefficiency", lbl:"Тепл. потери", dir:"min"},
    {k:"fuelContainmentBurden", lbl:"Нагрузка хранения", dir:"min"},
  ];
  const getV = (f,k)=> (f.attrs||{})[k];
  const best = {};
  for(const c of COLS){ const vs=fuels.map((f)=>getV(f,c.k)).filter((v)=>v!=null&&!isNaN(v)); if(!vs.length) continue; const mx=Math.max(...vs),mn=Math.min(...vs); if(mx===mn) continue; best[c.k]= c.dir==="max"?mx:mn; }
  const sec = el("details","sec foldsec"); sec.open = true;
  sec.appendChild(el("summary",null, i18n("⛽ Подходящее топливо ({n})", {n:fuels.length})));
  const tbl = el("table","ptbl slottbl");
  let thh = "<tr><th>"+i18n("Топливо")+"</th><th>"+i18n("Группа")+"</th>";
  COLS.forEach((c)=> thh += "<th>"+i18n(c.lbl)+"</th>");
  thh += "<th>"+i18n("Объём")+"</th>";
  tbl.appendChild(el("thead",null, thh+"</tr>"));
  const tb = el("tbody");
  fuels.slice().sort((a,b)=> (getV(b,"fuelEfficiency")||0)-(getV(a,"fuelEfficiency")||0)).forEach((f)=>{
    const tr = el("tr"); tr.style.cursor="pointer"; tr.onclick=()=>showDetail(f.id);
    const c0 = el("td","engnm"); c0.appendChild(icon(f.id,18)); c0.appendChild(el("span",null," "+esc(f.name))); tr.appendChild(c0);
    tr.appendChild(el("td","slotgrp", esc(f.grp||"")));
    for(const c of COLS){ const v=getV(f,c.k); const isB=best[c.k]!=null&&v===best[c.k]; const td=el("td", isB?"best":null); td.textContent=(v==null)?"—":num(v); tr.appendChild(td); }
    tr.appendChild(el("td",null, num(f.vol||0)));
    tb.appendChild(tr);
  });
  tbl.appendChild(tb); sec.appendChild(tbl);
  return sec;
}
// ── топливо → движки, которые им заправляются (зеркально fuelCompare: «X Fuel» → «X Engines») ──
function fuelEngines(fuel){
  const g = grpKey(fuel);
  if(!/Fuel$/.test(g)) return null;
  const engGrp = g.replace(/Fuel$/, "Engines").trim();   // Crude Fuel → Crude Engines
  const engs = DATA.types.filter((t)=> t.slot==="engine" && grpKey(t)===engGrp).map((t)=>t.id);
  if(!engs.length) return null;
  const sec = el("details","sec foldsec"); sec.open = true;
  sec.appendChild(el("summary",null, i18n("🚀 Заправляет движки ({n})", {n:engs.length})));
  sec.appendChild(slotTable(engs, "engine"));
  return sec;
}
function fitWheelSlot(t, k, i, cx, cy, R, angleDeg){
  const rad = angleDeg*Math.PI/180;
  const x = cx + R*Math.cos(rad), y = cy + R*Math.sin(rad);
  const mid = fitState.slots[k][i];
  const cell = el("div","wslot wslot-"+k + (activeSlot && activeSlot.k===k && activeSlot.i===i ? " act" : ""));
  cell.style.left = (x-23)+"px"; cell.style.top = (y-23)+"px";
  if(mid){ cell.appendChild(icon(mid,40)); cell.title = ty(mid).name; }
  else { cell.textContent = "+"; cell.title = SLOT_SHORT[k]+" "+(i+1); }
  cell.onclick = ()=>{ activeSlot = {k, i}; showFit(t.id); };
  return cell;
}
function showFit(shipId){
  const t = ty(shipId);
  if(!t.slots || !Object.keys(t.slots).length) return showDetail(shipId);
  selected = shipId; fitMode = true; listMode = false; initFit(t); updateListNav();
  const wantHash = "#fit-"+shipId;
  if(location.hash !== wantHash) location.hash = wantHash;
  syncSidebarTo(shipId);
  const d = $("#detail"); d.innerHTML = "";

  const hd = el("div","fithead");
  const back = el("button","sec-btn mini2",i18n("← к крафту")); back.onclick = ()=>{ activeSlot=null; showDetail(shipId); };
  hd.appendChild(back);
  hd.appendChild(icon(shipId,28));
  hd.appendChild(el("span","fittitle", esc(t.name)+i18n(" — фитинг")));
  const lnk = el("button","sec-btn mini2",i18n("🔗 Поделиться"));
  lnk.onclick = ()=>{ navigator.clipboard.writeText(location.href).then(()=>{ lnk.textContent="✓"; setTimeout(()=>lnk.textContent=i18n("🔗 Поделиться"),1200); }).catch(()=>{}); };
  hd.appendChild(lnk);
  d.appendChild(hd);

  const wrap = el("div","fitwrap");
  // кольцо
  const wheel = el("div","fitwheel");
  const SZ=440, cx=SZ/2, cy=SZ/2, R=176;
  wheel.style.width = wheel.style.height = SZ+"px";
  const center = el("div","wcenter"); center.appendChild(icon(shipId,128));
  center.appendChild(el("div","wcname", esc(t.name)));
  wheel.appendChild(center);
  const SECT_LBL = { hi:['HIGH',cx,16], med:['MED',SZ-20,cy], low:['LOW',cx,SZ-16], engine:['ENG',20,cy] };
  for(const k of ['hi','med','low','engine']){
    const n = t.slots[k]||0; if(!n) continue;
    const c = SECT_CENTER[k], sp = SECT_SPAN[k];
    for(let i=0;i<n;i++){
      const ang = n===1 ? c : (c - sp/2 + sp*(i/(n-1)));
      wheel.appendChild(fitWheelSlot(t,k,i,cx,cy,R,ang));
    }
    const L = SECT_LBL[k];
    const lab = el("div","wsectlbl wsect-"+k, L[0]); lab.style.left=L[1]+"px"; lab.style.top=L[2]+"px";
    wheel.appendChild(lab);
  }
  wrap.appendChild(wheel);

  // панель
  const panel = el("div","fitpanel");
  const sum = el("div"); renderFitSummary(t, sum); panel.appendChild(sum);
  if(activeSlot){
    const {k,i} = activeSlot;
    const box = el("div","modpick");
    box.appendChild(el("div","mph", i18n("Слот {s} {i} — выбери модуль:", {s:SLOT_SHORT[k]||k, i:i+1})));
    const cur = fitState.slots[k][i];
    const mk = (mid)=>{
      const o = el("div","modopt"+((cur===mid || (mid===null && cur==null))?" on":""));
      if(mid===null){ o.textContent=i18n("— пусто —"); }
      else {
        o.appendChild(icon(mid,20)); o.appendChild(el("span","mon"," "+esc(ty(mid).name)));
        const a = ty(mid).attrs||{}; o.appendChild(el("span","moinfo", `PG ${num(a.power||0)} · CPU ${num(a.cpu||0)}`));
      }
      o.onclick = ()=>{ fitState.slots[k][i] = mid; showFit(shipId); };
      return o;
    };
    box.appendChild(mk(null));
    (modsBySlot[k]||[]).filter((mid)=>modFits(mid,t.gid)).sort((a,b)=>ty(a).name.localeCompare(ty(b).name)).forEach((mid)=> box.appendChild(mk(mid)));
    panel.appendChild(box);
  } else {
    panel.appendChild(el("div","note",i18n("Кликни слот в кольце, чтобы поставить модуль.")));
  }
  panel.appendChild(shipStats(t));
  wrap.appendChild(panel);
  d.appendChild(wrap);
  d.scrollTop = 0;
}

