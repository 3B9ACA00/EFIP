// ── рецепты / BOM ────────────────────────────────────
const isCraftable = (id)=> !!(byOut[id] && byOut[id].length);
function outQty(r, id){ const o = r.out.find((x)=>x.id===id); return o ? o.q : (r.out[0] ? r.out[0].q : 1); }
// добываемое = руда (Asteroid). Остальное несырьё-сырьё (Salvage, Rogue Drone Components, Unknown) — ЛУТ.
const isLoot = (id)=> !isCraftable(id) && ty(id).cat !== 'Asteroid';
const REFINERIES = new Set([88063, 87161, 88064]); // Refinery / Field Refinery / Heavy Refinery
const PREF_REFINERY = 88063;   // Refinery — постройка по умолчанию для рефайна (при равном объёме; Heavy только в режиме «Мин. время»)
let availFac = null;                 // Set доступных facility id; null = все доступны
const facChecks = {};                // fid -> есть ли постройка (true по умолчанию)
const facOk = (r)=> !availFac || !(r.fac && r.fac.length) || r.fac.some((f)=>availFac.has(f));
function recipeOre(r){ if(!(r.fac||[]).some((f)=>REFINERIES.has(f))) return null; const o=(r.inp||[]).find((i)=> ty(i.id).cat==="Asteroid"); return o?o.id:null; }  // руда-источник рефайна
function refineSrc(r){ if(!(r.fac||[]).some((f)=>REFINERIES.has(f))) return null; return (r.inp&&r.inp[0]) ? r.inp[0].id : null; }   // главный вход рефайна (руда/лут/материал)
let _srcPref=null;   // источники (руда/лут), у которых ЕСТЬ рецепт на Refinery(88063)
function srcHasPref(r){ if(!_srcPref){ _srcPref=new Set(); DATA.recipes.forEach((x)=>{ if((x.fac||[]).includes(PREF_REFINERY)){ const s=refineSrc(x); if(s!=null) _srcPref.add(s); } }); } const s=refineSrc(r); return s!=null && _srcPref.has(s); }
let _oreReach=null;   // материалы, достижимые ИЗ РУДЫ (структурно, без учёта disable/лута) — кэш
function oreReachable(){
  if(_oreReach) return _oreReach;
  const R=new Set(); DATA.types.forEach((t)=>{ if(!isCraftable(t.id) && !isLoot(t.id)) R.add(t.id); });   // руда = достижима, лут = НЕТ
  for(let it=0; it<64; it++){ let ch=false;
    DATA.recipes.forEach((r)=>{ if((r.inp||[]).every((i)=>R.has(i.id))){ (r.out||[]).forEach((o)=>{ if(!R.has(o.id)){ R.add(o.id); ch=true; } }); } });
    if(!ch) break; }
  _oreReach=R; return R;
}
function recipeOk(r){
  if(!facOk(r)) return false;
  // ЛУТ — только last resort: рецепт с лут-входом запрещён, если ВСЕ его выходы достижимы из руды
  // (не подменяем добычу лут-шорткатом; «считаем только то, что копается»). Лут остаётся лишь для loot-only материалов.
  if((r.inp||[]).some((i)=>isLoot(i.id)) && (r.out||[]).every((o)=>oreReachable().has(o.id))) return false;
  const o=recipeOre(r); if(o!=null && oreDisabled.has(o)) return false;   // руда не выключена
  const f=(r.fac||[]).find((x)=>REFINERIES.has(x));   // ВСЕГДА Refinery: не-88063 рефайн исключаем, если у источника есть рецепт на 88063 (иначе фолбэк — Field/Heavy)
  if(f!=null && f!==PREF_REFINERY && srcHasPref(r)) return false;
  return true;
}
const _limitOverride = {};   // material id -> принудительный индекс рецепта (лимиты руды, режим custom)
const _lpChoice = {};        // material id -> индекс рецепта (глобальный оптимум LP; режимы volume/time)
const blockedItem = (id)=> isCraftable(id) && !byOut[id].some(facOk); // нет доступной постройки ни для одного пути
function resetCost(){ for(const k in _costMemo) delete _costMemo[k]; }
const _eq = (a,b)=> Math.abs(a-b) < 1e-9;
// Стоимость на 1 ед.: объём РУДЫ (копать) / ЛУТА (не добыть) / BLOCKED (нет постройки). Оптимум: сначала
// минимум blocked, затем лута, затем руды. + индекс лучшего ДОСТУПНОГО рецепта (мемо; сбрасывать при смене построек).
function unitCost(id, stack){
  const tm = (oreMode==="time");   // 'time': метрика = время произв.; иначе = объём руды. t = время (тайбрейк всегда: при равном объёме — быстрейшая постройка)
  if(!isCraftable(id)){
    const v = ty(id).vol||0;
    return isLoot(id) ? { ore:0, loot:v, blk:0, t:0, rp:0, ri:-1 } : { ore: tm?0:v, loot:0, blk:0, t:0, rp:0, ri:-1 };
  }
  if(id in _costMemo) return _costMemo[id];
  if(stack.has(id)){ const v=ty(id).vol||0; return { ore: tm?0:v, loot:0, blk:0, t:0, rp:0, ri:-1 }; }
  stack.add(id);
  let best = null;
  byOut[id].forEach((r,ri)=>{
    if(!recipeOk(r)) return;
    const per = outQty(r,id) || 1;
    let ore=0, loot=0, blk=0, t=0;
    for(const inp of r.inp){ const c=unitCost(inp.id, stack); ore+=c.ore*inp.q; loot+=c.loot*inp.q; blk+=(c.blk||0)*inp.q; t+=(c.t||0)*inp.q; }
    if(tm) ore += (r.rt||0);   // время-режим: длительность в основную метрику
    t += (r.rt||0);            // t копит время всегда (тайбрейк)
    ore/=per; loot/=per; blk/=per; t/=per;
    const rp = (r.fac||[]).includes(PREF_REFINERY) ? 0 : 1;   // равный объём → Refinery по умолчанию, затем быстрейшая
    const better = !best || blk<best.blk-1e-9
      || (_eq(blk,best.blk) && (loot<best.loot-1e-9
        || (_eq(loot,best.loot) && (ore<best.ore-1e-9
          || (_eq(ore,best.ore) && (rp<best.rp || (rp===best.rp && t<best.t-1e-9)))))));
    if(better) best = { ore, loot, blk, rp, t, ri };
  });
  stack.delete(id);
  if(!best) best = { ore:0, loot:0, blk: ty(id).vol||0, t:0, rp:0, ri:-1 }; // нет доступного пути → заблокирован
  _costMemo[id] = best;
  return best;
}
const bestIdx = (id)=>{ const c=unitCost(id,new Set()); return c.ri>=0?c.ri:0; };
function pathIdx(id){
  const a = byOut[id]||[];
  if(id in userPath && a[userPath[id]] && recipeOk(a[userPath[id]])) return userPath[id];   // явный выбор юзера
  return priorityIdx(id);
}
// приоритет руд > стоимость; только среди РАЗРЕШЁННЫХ (постройка ок + руда включена)
function priorityIdx(id){
  const a = byOut[id]||[]; if(!a.length) return 0;
  const ok = []; a.forEach((r,i)=>{ if(recipeOk(r)) ok.push(i); });
  if(!ok.length) return bestIdx(id);   // всё перекрыто → recipeFor вернёт null (blocked)
  const prio = (oreMode==="custom") ? orePriority : null;
  if(prio && prio.length){
    let bp=Infinity, pick=-1;
    ok.forEach((i)=>{ const o=recipeOre(a[i]); const p=(o!=null?prio.indexOf(o):-1); const pr=(p<0?Infinity:p); if(pr<bp){bp=pr;pick=i;} });
    if(pick>=0 && bp<Infinity) return pick;   // нашли руду из списка приоритета (custom/types)
  }
  return bestIdx(id);   // volume/time: по стоимости (unitCost учитывает метрику + скипает выключенные)
}
// стоимость на 1 ед. при использовании именно рецепта r (вложенные — оптимальные): {ore, loot}
function recipeUnitCost(r, id){
  const per=outQty(r,id)||1; let ore=0, loot=0;
  for(const inp of r.inp){ const c=unitCost(inp.id,new Set()); ore+=c.ore*inp.q; loot+=c.loot*inp.q; }
  return { ore: ore/per, loot: loot/per };
}
function recipeFor(id){
  const a = byOut[id]; if(!a || !a.length) return null;
  if(_lpChoice[id]!=null && a[_lpChoice[id]] && recipeOk(a[_lpChoice[id]])) return a[_lpChoice[id]];  // глобальный оптимум LP (volume/time)
  if(_limitOverride[id]!=null && a[_limitOverride[id]] && recipeOk(a[_limitOverride[id]])) return a[_limitOverride[id]];  // лимит-рероут
  const i = pathIdx(id);
  return (a[i] && recipeOk(a[i])) ? a[i] : null;  // null → лист (сырьё/лут/заблокировано/руда выключена)
}
// все постройки, которые могут понадобиться для предмета (по всем путям, рекурсивно)
function neededFacilities(rootId){
  const facs=new Set(), seen=new Set();
  (function walk(id){
    if(seen.has(id) || !isCraftable(id)) return; seen.add(id);
    for(const r of byOut[id]){ (r.fac||[]).forEach((f)=>facs.add(f)); for(const inp of r.inp) walk(inp.id); }
  })(rootId);
  return [...facs];
}
function rebuildAvail(){
  const all = DATA && DATA.facilities ? Object.keys(DATA.facilities).map(Number) : [];
  availFac = new Set(all.filter((f)=> facChecks[f] !== false));
  resetCost();
}
// шаг переработки руды (рецепт в Refinery), иначе обычный крафт
const isRefineStep = (id)=>{ const r=recipeFor(id); return !!(r && (r.fac||[]).some((f)=>REFINERIES.has(f))); };
// глубина узла (0 = сырьё) — для порядка шагов снизу вверх
function nodeDepth(id, memo){
  if(memo[id]!=null) return memo[id];
  const r=recipeFor(id); if(!r){ memo[id]=0; return 0; }
  memo[id]=0; let m=0; for(const inp of r.inp) m=Math.max(m, nodeDepth(inp.id, memo));
  return memo[id]=m+1;
}

// все руды-кандидаты для материалов BOM (по ВСЕМ рецептам, не только выбранным) — для панели приоритета
function planOres(rootId){
  const ores=new Set(), seen=new Set();
  (function walk(id){ if(seen.has(id)) return; seen.add(id);
    const recs=byOut[id]||[]; if(!recs.length) return;
    recs.forEach((r)=>{ const o=recipeOre(r); if(o!=null) ores.add(o); (r.inp||[]).forEach((i)=>walk(i.id)); });
  })(rootId);
  return [...ores];
}
// лут-предметы, достижимые в BOM (кандидаты на вкл/выкл; включая выключенные — чтобы их можно было вернуть)
function planLoot(rootId){
  const loot=new Set(), seen=new Set();
  (function walk(id){ if(seen.has(id)) return; seen.add(id);
    (byOut[id]||[]).forEach((r)=>{ (r.inp||[]).forEach((i)=>{ if(isLoot(i.id)) loot.add(i.id); walk(i.id); }); });
  })(rootId);
  return [...loot];
}
// ВСЕ ресурсы (руда+материалы+побочка), достижимые в дереве предмета по ЛЮБОМУ рецепту (recipeOk).
// Стабильный набор для грида склада — НЕ зависит от текущего выбора рецептов LP (иначе строки скачут при правке склада).
function allBomItems(rootId){
  const set=new Set(), seen=new Set();
  (function walk(id){ if(seen.has(id)) return; seen.add(id); set.add(id);
    (byOut[id]||[]).forEach((r)=>{ if(!recipeOk(r)) return; (r.out||[]).forEach((o)=>set.add(o.id)); (r.inp||[]).forEach((i)=>{ set.add(i.id); walk(i.id); }); });
  })(rootId);
  return [...set];
}
// материалы, у которых есть рецепты, но ВСЕ перекрыты (выключенной рудой) → крафт невозможен
function blockedMaterials(rootId){
  const blocked=[], seen=new Set();
  (function walk(id){ if(seen.has(id)) return; seen.add(id);
    const recs=byOut[id]||[]; if(!recs.length) return;
    const r=recipeFor(id);
    if(!r){ blocked.push(id); return; }   // рецепты есть, но recipeFor=null → перекрыто
    (r.inp||[]).forEach((i)=>walk(i.id));
  })(rootId);
  return blocked;
}
// выключенные руды, из-за которых сейчас сломан план (их надо вернуть) — для красной подсветки
function requiredDisabledOres(rootId){
  const blocked=blockedMaterials(rootId); const req=new Set();
  blocked.forEach((m)=>{ (byOut[m]||[]).forEach((r)=>{ const o=recipeOre(r); if(o!=null && oreDisabled.has(o)) req.add(o); }); });
  return req;
}
// лучший разрешённый рецепт id НЕ на руде avoidOre (для лимит-рероута)
function altRecipeIdx(id, avoidOre){
  const a=byOut[id]||[]; let bi=null, bc=Infinity;
  a.forEach((r,i)=>{ if(!recipeOk(r) || recipeOre(r)===avoidOre) return; const c=recipeUnitCost(r,id); const sc=c.loot*1e6+c.ore; if(sc<bc){bc=sc;bi=i;} });
  return bi;
}
// лимиты руды (custom): пока руда над лимитом — рероутим материал на альтернативную руду (грубо, по материалам)
function applyOreLimits(rootId, qty){
  for(const k in _limitOverride) delete _limitOverride[k];
  if(oreMode!=="custom") return;
  const limited = Object.keys(oreLimit).map(Number).filter((o)=>oreLimit[o]>0);
  if(!limited.length) return;
  for(let iter=0; iter<40; iter++){
    const p = plan(rootId, qty);
    let over=null; for(const o of limited){ if((p.raw[o]||0) > oreLimit[o]+1e-6){ over=o; break; } }
    if(over==null) return;
    let target=null, alt=null;
    for(const m of p.items){ const r=recipeFor(m); if(!r || recipeOre(r)!==over || _limitOverride[m]!=null) continue;
      const aidx=altRecipeIdx(m, over); if(aidx!=null){ target=m; alt=aidx; break; } }
    if(target==null) return;   // рероутить некуда → останется над лимитом (UI флагнет)
    _limitOverride[target]=alt;
  }
}
function oresOverLimit(p){ const over=[]; for(const o in oreLimit){ if(oreLimit[o]>0 && (p.raw[o]||0) > oreLimit[o]+1e-6) over.push(+o); } return over; }
// ГЛОБАЛЬНЫЙ ОПТИМУМ через LP (режимы volume/time): минимизируем суммарный объём руды (или время) с учётом
// совместных выходов / склада / выключенных руд / «всегда Refinery». Возвращает выбор рецептов {materialId: idx}.
function lpSelect(rootId, qty){
  _stockRoot = rootId;
  if(typeof lpSolve === "undefined") return null;
  const itemSet=new Set(), seen=new Set(), recSet=new Set();
  (function walk(id){ if(seen.has(id)) return; seen.add(id); itemSet.add(id);
    (byOut[id]||[]).forEach((r)=>{ if(!recipeOk(r)) return; recSet.add(r);
      (r.out||[]).forEach((o)=>itemSet.add(o.id)); (r.inp||[]).forEach((i)=>{ itemSet.add(i.id); walk(i.id); }); }); })(rootId);
  const recipes=[...recSet], recOf=new Map(); recipes.forEach((r,k)=>recOf.set(r,"r"+k));
  const vars=[]; recipes.forEach((r,k)=>vars.push("r"+k));
  // источники: руда + лут (лут доступен, но через лексикографику — last resort, см. ниже)
  const mineVar={}; itemSet.forEach((id)=>{ if(!isCraftable(id) && !oreDisabled.has(id)){ mineVar[id]="m"+id; vars.push("m"+id); } });
  const cons=[];
  itemSet.forEach((id)=>{ const coefs={};
    recipes.forEach((r,k)=>{ let c=0; const o=(r.out||[]).find((x)=>x.id===id); if(o)c+=o.q; const i=(r.inp||[]).find((x)=>x.id===id); if(i)c-=i.q; if(c) coefs["r"+k]=c; });
    if(mineVar[id]) coefs[mineVar[id]]=1;
    if(Object.keys(coefs).length) cons.push({coefs, rel:">=", rhs:(id===rootId?qty:0)-stockQty(id)}); });
  // ЛЕКСИКОГРАФИКА (как жадный unitCost loot→ore): лут — last resort (min ПЕРВЫМ, только когда нет рудного
  // пути), затем главная метрика (объём руды / время), затем остальное.
  const tm=(oreMode==="time"), oreObj={}, lootObj={}, timeObj={};
  for(const id in mineVar){ const w=ty(+id).vol||0; if(isLoot(+id)) lootObj[mineVar[id]]=w; else oreObj[mineVar[id]]=w; }
  recipes.forEach((r,k)=>{ if(r.rt) timeObj["r"+k]=r.rt; });
  const objs = (tm ? [lootObj, timeObj, oreObj] : [lootObj, oreObj]).filter((o)=>Object.keys(o).length);
  let res=null, c=cons;
  for(let lvl=0; lvl<objs.length; lvl++){
    res = lpSolve(vars, objs[lvl], c);
    if(!res || !res.ok) return null;
    if(lvl < objs.length-1) c = c.concat([{coefs:objs[lvl], rel:"<=", rhs:res.cost*(1+1e-7)+1e-6}]);   // зафиксировать уровень на оптимуме
  }
  if(!res){ res=lpSolve(vars, {}, cons); if(!res || !res.ok) return null; }
  // прогоны по рецептам (для построителя плана) + выбор dominant-рецепта на материал (для flow/tree через recipeFor)
  const runByRec=new Map();
  recipes.forEach((r)=>{ const v=res.val[recOf.get(r)]||0; if(v>1e-6) runByRec.set(r, v); });
  const choice={};
  itemSet.forEach((id)=>{ let bi=-1, best=1e-6;
    (byOut[id]||[]).forEach((r,i)=>{ const contrib=(runByRec.get(r)||0)*(outQty(r,id)||0); if(contrib>best){ best=contrib; bi=i; } });
    if(bi>=0) choice[id]=bi; });
  return { choice, recipes, runByRec };
}
const isRefineStepR = (r)=> !!(r && (r.fac||[]).some((f)=>REFINERIES.has(f)));   // рецепт = переработка (по постройке)
// Построить план НАПРЯМУЮ из LP-решения (прогоны рецептов, со сплитами и точным co-product балансом).
// Прогоны округляются вверх (никогда не недопроизводит); raw/byprod/время считаются по целым прогонам.
function lpBuild(rootId, qty, model){
  const runs=new Map();
  model.runByRec.forEach((v,r)=>{ const n=Math.ceil(v-1e-6); if(n>0) runs.set(r, n); });
  const prod={}, cons={};
  runs.forEach((n,r)=>{ (r.out||[]).forEach((o)=>prod[o.id]=(prod[o.id]||0)+o.q*n); (r.inp||[]).forEach((i)=>cons[i.id]=(cons[i.id]||0)+i.q*n); });
  const itemIds=new Set([rootId]); Object.keys(prod).forEach((id)=>itemIds.add(+id)); Object.keys(cons).forEach((id)=>itemIds.add(+id));
  const raw={};                                       // сырьё (не craftable): потребление − склад
  itemIds.forEach((id)=>{ if(!isCraftable(id)){ const need=(cons[id]||0)-stockQty(id); if(need>1e-6) raw[id]=need; } });
  const steps=[]; let totalTime=0;                    // по одному шагу на прогон рецепта; id = выход с макс. кол-вом
  runs.forEach((n,r)=>{ let main=r.out[0]; (r.out||[]).forEach((o)=>{ if(o.q>(main?main.q:-1)) main=o; });
    const id=main?main.id:rootId, rt=n*(r.rt||0); totalTime+=rt; steps.push({ id, r, runs:n, qty:n*(outQty(r,id)||1), rt }); });
  const byprod={}; itemIds.forEach((id)=>{ const ex=(prod[id]||0)-(cons[id]||0)-(id===rootId?qty:0); if(ex>1e-6 && id!==rootId) byprod[id]=ex; });
  const runsOf={}, supply=prod; steps.forEach((s)=> runsOf[s.id]=(runsOf[s.id]||0)+s.runs);   // collapsed — для flow/tree
  const demand=Object.assign({}, cons); demand[rootId]=(demand[rootId]||0)+qty;
  const buildTree=(id,need,anc)=>{ const r=recipeFor(id); if(!r||(anc&&anc.has(id))) return {id,qty:need,raw:true,children:[]};
    const per=outQty(r,id)||1, rn=Math.ceil(need/per); const a=new Set(anc||[]); a.add(id);
    return {id,qty:need,runs:rn,per,rt:rn*(r.rt||0),raw:false,children:r.inp.map((i)=>buildTree(i.id,i.q*rn,a))}; };
  const tree=buildTree(rootId, qty, new Set());
  return { tree, raw, steps, byprod, totalTime, runsOf, items:[...itemIds], demand, coSupply:{}, supply };
}
// План с ЗАЧЁТОМ побочных выходов переработки (мульти-выход рецептов).
// Фикспоинт: число прогонов каждого крафт-предмета = ceil((спрос − побочка от других рецептов)/выход).
// Так побочка (напр. Hydrocarbon Residue из переработки Feldspar) уменьшает отдельную переработку под неё.
function plan(rootId, qty){
  _stockRoot = rootId;
  for(const k in _lpChoice) delete _lpChoice[k];
  if(oreMode!=="custom"){ const m=lpSelect(rootId, qty); if(m){ Object.assign(_lpChoice, m.choice); return lpBuild(rootId, qty, m); } }
  // (custom, либо LP не решился) — жадный фикспоинт с зачётом побочки
  // 1) набор предметов BOM (по выбранным путям recipeFor)
  const items = new Set();
  (function walk(id, anc){
    if(items.has(id)) return; items.add(id);
    const r = recipeFor(id); if(!r || anc.has(id)) return;
    const a = new Set(anc); a.add(id);
    for(const i of r.inp) walk(i.id, a);
  })(rootId, new Set());
  const list = [...items];
  const craft = list.filter((id)=> recipeFor(id));
  // 2) фикспоинт по числу прогонов с зачётом побочки
  const runsOf = {}; craft.forEach((id)=> runsOf[id]=0);
  let demand = {}, coSupply = {};
  const recompute = ()=>{
    demand = {}; coSupply = {}; demand[rootId] = qty;
    for(const x of craft){ const r = recipeFor(x), runs = runsOf[x]; if(!runs) continue;
      for(const i of r.inp) demand[i.id] = (demand[i.id]||0) + i.q*runs;
      for(const o of r.out) if(o.id!==x) coSupply[o.id] = (coSupply[o.id]||0) + o.q*runs;  // побочные выходы
    }
  };
  for(let iter=0; iter<64; iter++){
    recompute();
    let changed = false;
    for(const id of craft){ const r = recipeFor(id), per = outQty(r,id)||1;
      const net = Math.max(0, (demand[id]||0) - (coSupply[id]||0) - stockQty(id));   // побочка + склад покрывают часть спроса
      const nr = Math.ceil(net/per);
      if(nr !== runsOf[id]){ runsOf[id] = nr; changed = true; }
    }
    if(!changed) break;
  }
  recompute();
  // 3) агрегаты: руда/лут (raw), шаги (inter), побочка-бонус (byprod), время
  const raw = {}, inter = {}, byprod = {}, supply = {}; let totalTime = 0;
  for(const x of craft){ const r = recipeFor(x), runs = runsOf[x]; if(!runs) continue;
    const rt = runs*(r.rt||0); totalTime += rt;
    inter[x] = { qty: runs*(outQty(r,x)||1), runs, rt };
    for(const o of r.out) supply[o.id] = (supply[o.id]||0) + o.q*runs;
  }
  for(const id of list) if(!recipeFor(id)) raw[id] = Math.max(0, (demand[id]||0) - stockQty(id));   // склад уменьшает добычу
  for(const id in supply){ const ex = supply[id] - (demand[id]||0); if(ex > 1e-9 && +id !== rootId) byprod[+id] = ex; }
  // 4) дерево (из выбранных путей, рекурсивно — для совместимости/визуализации)
  const buildTree = (id, need, anc)=>{
    const r = recipeFor(id);
    if(!r || (anc && anc.has(id))) return { id, qty:need, raw:true, children:[] };   // защита от циклов (как в walk выше)
    const per = outQty(r,id)||1, runs = Math.ceil(need/per);
    const a = new Set(anc||[]); a.add(id);
    return { id, qty:need, runs, per, rt:runs*(r.rt||0), raw:false, children: r.inp.map((i)=> buildTree(i.id, i.q*runs, a)) };
  };
  const tree = buildTree(rootId, qty, new Set());
  const steps=[]; for(const x of craft){ const v=inter[x]; if(v&&v.runs) steps.push({id:x, r:recipeFor(x), runs:v.runs, qty:v.qty, rt:v.rt}); }
  return { tree, raw, steps, inter, byprod, totalTime, runsOf, items:list, demand, coSupply, supply };
}

// ── дерево ───────────────────────────────────────────
function treeNode(n){
  const t = ty(n.id);
  if(n.raw || !n.children.length){
    const leaf = el("div","tnode"+(n.raw?" rawn":""));
    leaf.appendChild(icon(n.id,24));
    leaf.appendChild(el("span","q", num(n.qty)+"×"));
    leaf.appendChild(el("span","nm", " "+esc(t.name)));
    if(n.raw) leaf.appendChild(el("span", isLoot(n.id)?"loot":"raw", isLoot(n.id)?i18n(" лут"):i18n(" накопать")));
    return leaf;
  }
  const d = el("details"); d.open = depthOpen-- > 0;
  const s = el("summary");
  const head = el("span","tnode");
  head.appendChild(icon(n.id,24));
  head.appendChild(el("span","q", num(n.qty)+"×"));
  head.appendChild(el("span","nm"," "+esc(t.name)));
  head.appendChild(el("span","refnote", `  (${n.runs} ${runsWord(n.runs)}, ${fmtTime(n.rt)})`));
  const r = recipeFor(n.id);
  if(r && r.fac && r.fac.length){
    const fc = el("span","tfac"); fc.appendChild(icon(r.fac[0],15));
    fc.appendChild(document.createTextNode(" "+ty(r.fac[0]).name));
    head.appendChild(fc);
  }
  s.appendChild(head); d.appendChild(s);
  // переключатель путей прямо в дереве (если у узла есть альтернативы)
  const alts = byOut[n.id] || [];
  if(alts.length > 1){
    const cur = pathIdx(n.id), best = bestIdx(n.id);
    const sel = el("div","treepaths");
    alts.forEach((rr,i)=>{
      const b = el("button","tpath"+(i===cur?" on":"")+(i===best?" best":""));
      const fac = (rr.fac||[]).map((f)=>ty(f).name)[0] || "—";
      const uc = recipeUnitCost(rr, n.id);
      b.innerHTML = `${esc(fac)} <span class="v">${num(uc.ore)}${i18n("м³")}${uc.loot>0?i18n('+лут'):''}</span>` + (i===best?` ✓`:``);
      b.title = `${rr.inp.map((x)=>x.q+" "+ty(x.id).name).join(" + ")}  →  ${outQty(rr,n.id)} ${ty(n.id).name}`;
      b.onclick = (e)=>{ e.preventDefault(); userPath[n.id]=i; rerenderPlan(); };
      sel.appendChild(b);
    });
    d.appendChild(sel);
  }
  for(const c of n.children) d.appendChild(treeNode(c));
  return d;
}
function plural(n){ n=Math.abs(n)%100; const n1=n%10; if(n>10&&n<20)return "ов"; if(n1>1&&n1<5)return "а"; if(n1===1)return ""; return "ов"; }

