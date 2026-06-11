"use strict";
// EF Industry — каталог, рецепты (multi-output) и BOM-планировщик крафта EVE Frontier.
// Данные: data.json (decoded SDE: industry_blueprints + industry_facilities).

const ICONS = "icons/";  // локальные иконки из клиента (extract_icons.py)
const CAT_COLOR = {
  // приглушённая тёпло-сбалансированная гамма под палитру EVE Frontier (не «радуга»)
  Ship:"#ff6a3d", Module:"#8a96a8", Material:"#9aa861", Charge:"#e0a93a",
  Commodity:"#b189c4", Asteroid:"#c98a3a", Deployable:"#5fa99d", Blueprint:"#cf6b80", Unknown:"#8a8276",
};
const CAT_ORDER = ["Ship","Module","Charge","Material","Commodity","Asteroid","Deployable","Blueprint","Unknown"];
const catRank = (c)=>{ const i = CAT_ORDER.indexOf(c); return i < 0 ? CAT_ORDER.length + 1 : i; };

let DATA = null;
const T = {};         // id -> type
const byOut = {};     // output id -> [recipes дающих его]
const byInput = {};   // input id -> [recipes где используется]
const modsBySlot = { hi:[], med:[], low:[], engine:[] };  // slot -> [moduleIds]
let fitState = null;  // конструктор фита: {shipId, slots:{hi:[id|null,...], med:[...], low:[...], engine:[...]}}
let activeSlot = null;  // выбранный слот в фит-виле: {k, i}
let fitMode = false;    // открыт ли экран фитинга (для роутинга)
let selected = null;
let selectedCat = null;     // выбранная категория (2-й сайдбар)
let viewMode = "tile";      // вид списка предметов: tile | list
let depthOpen = 99;
let _lastPlan = null;
let _lastTree = null;        // (устарело)
let _lastGraph = null;       // {id,qty,host} последнего отрендеренного графа (для rerenderPlan)
let cmpHidden = new Set();   // скрытые корабли в сравнении
let cmpSort = null;          // {key,dir} сортировка сравнения по показателю
let detailTab = 0;           // активный таб карточки предмета (запоминается между предметами)
function rerenderPlan(){ if(_lastPlan) renderPlan(_lastPlan.id, _lastPlan.qty, _lastPlan.host); if(_lastGraph) renderGraph(_lastGraph.id, _lastGraph.qty, _lastGraph.host); }
const userPath = {};     // явный выбор пользователя: typeId -> индекс рецепта (иначе берётся оптимальный)
const reprocPath = {};   // выбранная рефайнилка для блока переработки руды: typeId -> индекс рецепта
let orePriority = [];     // приоритет руд (custom): выше = раньше выбирается планом
const oreDisabled = new Set();   // выключенные руды (исключены из расчёта)
let oreMode = "volume";   // пресет оптимизации: 'volume'|'time'|'types'|'custom'
const oreLimit = {};      // custom: oreId -> макс. единиц (лимит копки)
const stock = {};         // склад (глобальный, общий): itemId -> {qty, comment, off, ord}
const stockLocal = {};    // локальные склады per-item: rootId -> {itemId:{...}}
const stockLocalOn = new Set();   // rootId, у которых включён ЛОКАЛЬНЫЙ склад (иначе общий)
let _stockRoot = null;    // корень текущего плана (для curStock в локальном режиме)
let _stockSort = { col:"ord", dir:1 };   // сортировка склада: ord(по умолч.)/name/comment/qty
let _stockOpen = null;   // развёрнут ли блок Склад (<details>); null = по умолчанию (открыт если есть заполненные)
let _stockView = { by:"need", dir:-1, group:"type" };   // вид склада: сорт need/name/have + dir(-1 убыв.) + группировка type/cat/filled/none
let _stockCollapsed = new Set();   // свёрнутые группы склада (ключи tN / c:cat / fN); session-only
try{
  orePriority = JSON.parse(localStorage.getItem("ef_orePrio")||"[]")||[];
  (JSON.parse(localStorage.getItem("ef_oreOff")||"[]")||[]).forEach((x)=>oreDisabled.add(x));
  oreMode = localStorage.getItem("ef_oreMode") || "volume"; if(oreMode==="types") oreMode="volume";   // пресет 'types' убран
  Object.assign(oreLimit, JSON.parse(localStorage.getItem("ef_oreLimit")||"{}")||{});
  Object.assign(stock, JSON.parse(localStorage.getItem("ef_stock")||"{}")||{});
  Object.assign(stockLocal, JSON.parse(localStorage.getItem("ef_stock_local")||"{}")||{});
  (JSON.parse(localStorage.getItem("ef_stock_localon")||"[]")||[]).forEach((x)=>stockLocalOn.add(+x));
  const _mig=(s)=>{ let o=0; for(const k in s){ const v=s[k]; if(typeof v!=="object"||!v) s[k]={qty:+v||0,comment:"",off:false}; if(s[k].ord==null) s[k].ord=++o; } };
  _mig(stock); for(const r in stockLocal) _mig(stockLocal[r]);
  Object.assign(_stockView, JSON.parse(localStorage.getItem("ef_stockview")||"{}")||{});
  if(_stockView.group===true) _stockView.group="type"; else if(_stockView.group===false) _stockView.group="none";   // миграция boolean→строка
}catch(e){}
function saveOrePrefs(){ try{
  localStorage.setItem("ef_orePrio", JSON.stringify(orePriority));
  localStorage.setItem("ef_oreOff", JSON.stringify([...oreDisabled]));
  localStorage.setItem("ef_oreMode", oreMode);
  localStorage.setItem("ef_oreLimit", JSON.stringify(oreLimit));
  localStorage.setItem("ef_stock", JSON.stringify(stock));
  localStorage.setItem("ef_stock_local", JSON.stringify(stockLocal));
  localStorage.setItem("ef_stock_localon", JSON.stringify([...stockLocalOn]));
  localStorage.setItem("ef_stockview", JSON.stringify(_stockView));
}catch(e){} }
// активный склад: общий (stock) или локальный для корня плана (если включён локальный режим)
function curStock(){ const r=(_stockRoot!=null)?_stockRoot:selected; return stockLocalOn.has(r) ? (stockLocal[r]||(stockLocal[r]={})) : stock; }
function stockQty(id){ const s=curStock()[id]; if(!s||s.off) return 0; return s.inf ? 1e15 : (+s.qty||0); }   // эффективное кол-во со склада (0 если отключён; ∞ = 1e15)
// модалка подтверждения (нет нативного confirm-стиля под тему); onYes() при «Да»/Enter
function confirmModal(msg, onYes){
  const mk=(tag,cls,txt)=>{ const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };
  const ov=mk("div","modalov"), box=mk("div","modalbox");
  box.appendChild(mk("div","modalmsg",msg));
  const row=mk("div","modalrow"), no=mk("button","sec-btn",i18n("Отмена")), yes=mk("button","sec-btn modalyes",i18n("Да"));
  const close=()=>{ ov.remove(); document.removeEventListener("keydown",key); };
  const key=(ev)=>{ if(ev.key==="Escape") close(); else if(ev.key==="Enter"){ close(); onYes(); } };
  no.onclick=close; yes.onclick=()=>{ close(); onYes(); }; ov.onclick=(ev)=>{ if(ev.target===ov) close(); };
  document.addEventListener("keydown",key);
  row.appendChild(no); row.appendChild(yes); box.appendChild(row); ov.appendChild(box);
  document.body.appendChild(ov); yes.focus();
}
const _costMemo = {};    // мемоизация стоимости (объём сырья на 1 ед.)

// ── утилиты ──────────────────────────────────────────
const $ = (s)=>document.querySelector(s);
const el = (t,c,h)=>{ const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e; };
const esc = (s)=>String(s==null?"":s).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const num = (n)=>(Math.round((n+Number.EPSILON)*100)/100).toLocaleString("ru-RU");
const ty  = (id)=>T[id] || {id, name:"#"+id, cat:"Unknown", grp:"", vol:0, mass:0, icon:0};
function fmtTime(sec){
  sec = Math.round(sec||0);
  const d=Math.floor(sec/86400), h=Math.floor(sec%86400/3600), m=Math.floor(sec%3600/60), s=sec%60;
  const p=[]; if(d)p.push(d+i18n("д")); if(h)p.push(h+i18n("ч")); if(m)p.push(m+i18n("м")); if(s||!p.length)p.push(s+i18n("с"));
  return p.join(" ");
}

// ── i18n: EN по умолчанию, RU — перевод. Ключ = русская строка (с {плейсхолдерами} для подстановок). ──
let LANG = (()=>{ try{ return localStorage.getItem("ef_lang") || "en"; }catch(e){ return "en"; } })();
function i18n(s, vars){
  let out = (LANG === "en" && EN[s] != null) ? EN[s] : s;
  if(vars) for(const k in vars) out = out.split("{"+k+"}").join(vars[k]);
  return out;
}
const runsWord = (n)=> LANG==="en" ? ("run"+(n===1?"":"s")) : ("прогон"+plural(n));
const EN = {
  // шапка / навигация (index.html)
  "EVE Frontier — крафт и ресурсы":"EVE Frontier — crafting & resources","Промышленность":"Industry","Рынок":"Market","Карта":"Map","Логистика":"Logistics","скоро":"soon",
  "Поиск по всем предметам — название или id…":"Search all items — name or id…","Поиск в категории…":"Search in category…","Плитка":"Tiles","Список":"List","⚖ Корабли":"⚖ Ships","Сравнить все корабли":"Compare all ships","Выбери предмет — покажу рецепт и пошаговый план.":"Pick an item — I'll show the recipe and step-by-step plan.",
  // единицы / фрагменты
  "д":"d","ч":"h","м":"m","с":"s","мс":"ms","кг":"kg","м³":"m³","м/с":"m/s"," шт":" pcs"," лут":" loot"," накопать":" mine"," показать все":" show all",
  "крафт":"craft","сырьё":"raw","сбросить":"reset","всё есть":"have all","поб.":"by-prod.","побочный":"by-product","Тип":"Type","— пусто —":"— empty —",
  "  ⚠ превышение!":"  ⚠ over limit!"," — отметь одну из: ":" — pick one of: "," — фитинг":" — fitting","время: ":"time: ","Открыть ":"Open ",
  // характеристики (charsPanel + сравнение + фит)
  "Общее":"General","Слоты":"Slots","Слот":"Slot","Атрибуты":"Attributes","Категория":"Category","Группа":"Group","Объём":"Volume","Масса":"Mass","Карго":"Cargo","Показатель":"Stat",
  "Объём, м³":"Volume, m³","Масса, кг":"Mass, kg","Карго, м³":"Cargo, m³","Защита":"Defense","Фиттинг":"Fitting","Мобильность":"Mobility","Вместимость":"Capacity",
  "HP (корпус)":"HP (hull)","HP корпуса":"Hull HP","HP брони":"Armor HP","Броня":"Armor","Щит":"Shield","Ёмкость щита":"Shield capacity","Ёмкость капаситора":"Capacitor capacity","Капаситор":"Capacitor",
  "PowerGrid (расход)":"PowerGrid (use)","CPU (расход)":"CPU (use)","Расход капаситора":"Capacitor use","Длительность цикла":"Cycle time","Дальность":"Range","Перезарядка":"Reload",
  "Эмиссия сигнатуры":"Signature emission","Скор. восстановления":"Recharge rate","Расход топлива (варп)":"Fuel use (warp)","Расход топлива":"Fuel use","Множитель урона":"Damage multiplier",
  "Скорость наведения":"Tracking speed","Бонус HP брони":"Armor HP bonus","Бонус вместимости":"Capacity bonus","Множитель скорости":"Speed factor",
  "Скорость":"Speed","Скорость, м/с":"Speed, m/s","Инерция":"Inertia","Варп, ×":"Warp, ×","Скорость варпа":"Warp speed","Сигнатура":"Signature","Сигнатура, м":"Signature, m",
  "Бак топлива":"Fuel bay","Топливо":"Fuel","Сопр. кинетике":"Kinetic resist","Сопр. термал":"Thermal resist","Сопр. взрыву":"Explosive resist","Сопр. EM":"EM resist",
  // короткие подписи фита
  "Броня+":"Armor+","Варп-топл.":"WarpFuel","Дальн.":"Range","Длит.":"Cycle","Кап-рег.":"CapRech","Карго+":"Cargo+","Сигн.":"Sig","Трек.":"Track","Урон×":"Dmg×",
  "⚡ Ёмкость кап.":"⚡ Cap capacity","⛽ Бак топлива":"⛽ Fuel bay","🌀 Варп":"🌀 Warp","🎯 Манёвр (agility)":"🎯 Agility","🏋 Масса":"🏋 Mass","📡 Сигнатура":"📡 Signature","📦 Карго":"📦 Cargo","🔵 Щит":"🔵 Shield","🚀 Скорость":"🚀 Speed","🛡 HP корпус":"🛡 Hull HP","🩹 Броня":"🩹 Armor",
  // секции / кнопки / сообщения
  "Сырьё":"Raw materials","Пошаговый план":"Step-by-step plan","Сколько сделать:":"Quantity:","🔗 Поделиться":"🔗 Share","✓ скопировано":"✓ copied","⧉ копировать сырьё":"⧉ copy raw list",
  "🌳 Дерево производства (детально)":"🌳 Production tree (detailed)","🎁 Побочные продукты (бонусом)":"🎁 By-products (bonus)","🏭 Нужные постройки":"🏭 Required structures","🏭 Мои постройки:":"🏭 My structures:","🏭 производится в:":"🏭 produced in:",
  "📊 Характеристики":"📊 Characteristics","📊 Характеристики корабля":"📊 Ship characteristics","← к крафту":"← to craft","← требуется:":"← requires:","↕ по классу":"↕ by class",
  "♨ Переработать (руда → материалы)":"♨ Reprocess (ore → materials)","⚙ Скрафтить компоненты":"⚙ Craft components","⚙ Открыть фитинг (кольцо)":"⚙ Open fitting (ring)","⚙ Скрафтить компоненты":"⚙ Craft components",
  "⛏ Выкопать (руда)":"⛏ Mine (ore)","⛏ Руда — добывается майнингом.":"⛏ Ore — obtained by mining.",
  "🪨 Астероид — добывается майнингом, даёт руду.":"🪨 Asteroid — mined to extract ore.","⛏ Что добывается":"⛏ Yields ore","Добывается из:":"Mined from:","🎁 Налутать (не добывается)":"🎁 Loot (not mined)","🎁 Лут — не добывается, выпадает (salvage/дроп).":"🎁 Loot — not mined, drops (salvage/drop).",
  "⚠ Не хватает построек — без них эти предметы не сделать:":"⚠ Missing structures — these items can't be made without them:","🚀 Финальный крафт — ":"🚀 Final craft — ",
  "🛠 Фитилка — собрать корабль":"🛠 Fitter — build a ship","🔧 Слоты и модули — что можно поставить (фит)":"🔧 Slots and modules — what can be fitted","Кликни слот в кольце, чтобы поставить модуль.":"Click a slot in the ring to fit a module.",
  "⚔ Hi — оружие / добыча":"⚔ Hi — weapons / mining","🛡 Med — щиты / варп":"🛡 Med — shields / warp","🔧 Low — защита / карго":"🔧 Low — defense / cargo","🚀 Engine — движки":"🚀 Engine — engines","🎯 Turret — точки турелей":"🎯 Turret — turret hardpoints","🎇 Launcher — точки ракет":"🎇 Launcher — missile hardpoints","точки для оружия (модули из Hi)":"weapon hardpoints (Hi modules)",
  "Совместимость по группе корабля (canFitShipGroup). Расход PG/CPU — в фитилке выше.":"Compatibility by ship group (canFitShipGroup). PG/CPU use — in the fitter above.",
  "Лимит PG/CPU корабля — главное ограничение фита. Бонусы модулей к ТТХ (HP/скорость/резисты) — следующий шаг.":"Ship PG/CPU limits are the main fitting constraint. Module bonuses (HP/speed/resists) — next step.",
  "🚀 Сравнение кораблей":"🚀 Ship comparison","↕ по классу":"↕ by class","Все корабли скрыты — отметь хотя бы один в «Корабли ▾».":"All ships hidden — check at least one in «Ships ▾».",
  "Корабли — в колонках. Клик по показателю — сортировка, по кораблю — открыть. Зелёным — лучшее в строке (для инерции и сигнатуры меньшее = лучше).":"Ships are columns. Click a stat to sort, a ship to open. Green = best in row (lower is better for inertia and signature).",
  // таблицы плана (HTML)
  "<tr><th></th><th>Ресурс</th><th class='ar'>Нужно</th></tr>":"<tr><th></th><th>Resource</th><th class='ar'>Need</th></tr>",
  "<tr><th></th><th>Компонент</th><th class='ar'>Кол-во</th>":"<tr><th></th><th>Component</th><th class='ar'>Qty</th>",
  "<th class='ar' title='Сколько раз запускается рецепт'>Прогоны</th>":"<th class='ar' title='How many times the recipe runs'>Runs</th>",
  "<th class='ar'>Время</th><th>Постройка</th><th>Сырьё на шаг</th></tr>":"<th class='ar'>Time</th><th>Structure</th><th>Raw/step</th></tr>",
  "<tr><th></th><th>Постройка</th><th>Нужно (вход)</th><th>Даёт (выход)</th><th>Сырьё/шт</th><th>Время</th></tr>":"<tr><th></th><th>Structure</th><th>Need (in)</th><th>Gives (out)</th><th>Raw/pc</th><th>Time</th></tr>",
  "<tr><th>Модуль</th><th>Группа</th>":"<tr><th>Module</th><th>Group</th>",
  "<tr><th>Слот</th><th>Шт</th><th>Что подходит</th></tr>":"<tr><th>Slot</th><th>Qty</th><th>What fits</th></tr>",
  // интерполяции ({n}/{id}/...)
  "Рецепты и пути: {n} (клик по строке — выбрать для расчёта)":"Recipes & paths: {n} (click a row to pick for calc)",
  "Рецепт":"Recipe","объём {v} м³ · id {id}":"vol {v} m³ · id {id}","Используется в крафте ({n})":"Used in crafting ({n})",
  "🔧 Подходит к модулям ({n})":"🔧 Fits modules ({n})","🎯 Совместимые заряды ({n})":"🎯 Compatible charges ({n})",
  "🏭 Здесь создаётся ({n})":"🏭 Crafted here ({n})","♨ Здесь можно переработать ({n})":"♨ Reprocess here ({n})",
  "🚀 Подходящие движки ({n})":"🚀 Compatible engines ({n})","⛽ Подходящее топливо ({n})":"⛽ Compatible fuel ({n})","🚀 Заправляет движки ({n})":"🚀 Fuels engines ({n})",
  "Топливо":"Fuel","КПД топлива":"Fuel efficiency","Тепл. потери":"Thermal loss","Нагрузка хранения":"Containment burden",
  "План":"Plan","Связи":"Related","Характеристики":"Characteristics","Дерево":"Tree",
  "Рецепт и план":"Recipe & plan","План производства":"Production plan","Дерево производства":"Production tree",
  "♨ Где переработать ({n})":"♨ Where to reprocess ({n})","→ даёт: ":"→ yields: ",
  "♨ Переработка":"♨ Reprocessing","Перерабатываем":"Reprocess","Получаем":"Yields",
  "↕ порядок = приоритет · ☑ вкл/выкл":"↕ order = priority · ☑ on/off","альт":"alt","Выключить руду":"Disable ore","Включить руду":"Enable ore","Выключить лут":"Disable loot","Включить лут":"Enable loot","Выключить лут (если есть рудная альтернатива)":"Disable loot (if ore alternative exists)",
  "Выше приоритет":"Higher priority","Ниже приоритет":"Lower priority","🎁 Лут — добираем только при необходимости":"🎁 Loot — used only when necessary",
  "↕ порядок = приоритет · ☑ вкл/выкл · лимит":"↕ order = priority · ☑ on/off · limit","порядок — авто по пресету · ☑ вкл/выкл":"order auto by preset · ☑ on/off",
  "Лимит копки (макс. ед.); пусто = без лимита":"Mining limit (max units); empty = no limit","⚠ Не уложиться в лимит: {n} — не хватает альтернатив.":"⚠ Can't stay under limit: {n} — not enough alternatives.",
  "Что уже есть (склад)":"In stock (have)","впиши, что уже накоплено — вычтется из плана":"enter what you already have — subtracted from the plan","заполнено: {n}":"filled: {n}",
  "⟲ Очистить склад":"⟲ Clear stock","Руда и лут":"Ores & loot","Материалы и компоненты":"Materials & components",
  "➕ Добавить ресурс":"➕ Add resource","Очистить":"Clear","Ресурс":"Resource","Комментарий":"Comment","Кол-во":"Qty",
  "Редактировать":"Edit","Удалить":"Delete","Отключить":"Disable","Включить":"Enable","Сохранить":"Save","Отмена":"Cancel","Добавить":"Add",
  "комментарий":"comment","— выбери ресурс —":"— pick a resource —","Пусто — жми «Добавить ресурс», чтобы указать, что уже есть.":"Empty — click “Add resource” to list what you already have.",
  "Склад":"Stock","Рефайн":"Refine","Крафт":"Craft","Действия":"Actions","Пусто — добавь ресурс ниже.":"Empty — add a resource below.",
  "Заметка":"Note","заметка":"note","{n} заполнено":"{n} filled","впиши, что уже есть":"enter what you have","Выключить весь склад":"Disable all stock","Включить весь склад":"Enable all stock","Кликни — вписать количество":"Click to enter quantity","Кликни — заметка":"Click to add a note",
  "локальный":"local","Отдельный склад только для этого предмета (иначе — общий для всех)":"Separate stock for this item only (otherwise shared)","Изменить количество":"Edit quantity","Бесконечно (не добывать)":"Infinite (don't mine/loot)","Снять «бесконечно»":"Remove infinite",
  "Произвести":"Produce","шт":"pcs","Да":"Yes","Отмена":"Cancel","Очистить весь склад?":"Clear all stock?","Убрать «{name}» из склада?":"Remove «{name}» from stock?",
  "Сортировка":"Sort","по «нужно»":"by need","по имени":"by name","по стоку":"by stock","Группы":"Groups","По убыванию":"Descending","По возрастанию":"Ascending","Группировка по типам — клик: плоский список":"Grouped by type — click for flat list","Плоский список — клик: группировать по типам":"Flat list — click to group by type",
  "Группировка":"Grouping","Нужно ↓":"Need ↓","Нужно ↑":"Need ↑","Имя А–Я":"Name A–Z","Имя Я–А":"Name Z–A","Сток ↓":"Stock ↓","Сток ↑":"Stock ↑","По типам":"By type","По категории":"By category","Без группировки":"No grouping","Заполнено / пусто":"Filled / empty","Заполнено":"Filled","Пусто":"Empty",
  "тащи строку или ▲▼ = приоритет · ☑ вкл/выкл":"drag row or ▲▼ = priority · ☑ on/off","порядок — авто по пресету":"order auto by preset","⟲ Сбросить лимиты":"⟲ Reset limits","Сбросить лимит":"Clear limit",
  "Руда":"Ore","Нужно":"Need","вкл":"on","Лимит":"Limit",
  "Минимум объёма руды на хаул — макс. выход материала на m³.":"Least ore volume to haul — max material per m³.","Минимум суммарного времени переработки.":"Least total refining time.",
  "⛏ Мин. объём руды":"⛏ Min ore volume","⏱ Мин. время производства":"⏱ Min production time","✎ Custom":"✎ Custom",
  "Меньше разных руд — приоритет рудам с мульти-выходом.":"Fewer distinct ores — favors multi-output ores.","Ручной порядок (тащи строку / стрелки ▲▼), вкл/выкл, лимиты по руде.":"Manual order (drag row / ▲▼), on/off, per-ore limits.",
  "⚠ Крафт невозможен — нет источника: {n}. Верни выключенную руду.":"⚠ Can't craft — no source for: {n}. Re-enable an ore.",
  "Рецепты здесь":"Recipes here","Что производится в постройке":"What's produced in this structure","Рецептов: {n}":"Recipes: {n}",
  "<tr><th>Из чего</th><th></th><th>Получаем</th><th class='ar'>Время</th></tr>":"<tr><th>From</th><th></th><th>Get</th><th class='ar'>Time</th></tr>",
  "произвести:":"produce:","🏭 постройка":"🏭 facility","без ингредиентов":"no ingredients",
  "Постройка":"Facility","Ингредиенты":"Ingredients","Результат":"Result",
  "Выбрать этот путь":"Pick this path","текущий путь":"current path","Вариант рецепта":"Recipe variant","Выбрать этот вариант":"Pick this variant","текущий вариант":"current variant",
  "Добыча и лут":"Mining & looting","Переработка":"Refining","Крафт":"Crafting","⛏ копать":"⛏ mine","🎁 лут":"🎁 loot","побочно":"by-product",
  "Граф":"Flow","Граф производства":"Production flow","без рецепта":"no recipe","Базовое сырьё":"Base resources","Финал":"Final","⛶ На весь экран":"⛶ Fullscreen","остаток (бонус-побочка)":"leftover (bonus by-product)",
  "<b>—</b> поток &nbsp; <b style='color:var(--violet)'>--</b> побочка &nbsp; <span class='lgr'></span> руда &nbsp; <span class='lgf'></span> финал":"<b>—</b> flow &nbsp; <b style='color:var(--violet)'>--</b> by-product &nbsp; <span class='lgr'></span> ore &nbsp; <span class='lgf'></span> final",
  "<tr><th></th><th>Ресурс</th><th>Источник</th><th class='ar'>Нужно</th></tr>":"<tr><th></th><th>Resource</th><th>Source</th><th class='ar'>Need</th></tr>",
  "<tr><th>Из чего</th><th></th><th>Получаем</th><th class='ar'>Прогоны</th><th class='ar'>Время</th><th>Постройка</th></tr>":"<tr><th>From</th><th></th><th>Get</th><th class='ar'>Runs</th><th class='ar'>Time</th><th>Structure</th></tr>",
  "⚙ Корабли: {a}/{b} ▾":"⚙ Ships: {a}/{b} ▾","{n} из {m}":"{n} of {m}","Поиск «":"Search «",
  "Цель: <b>{q} × {name}</b> &nbsp;·&nbsp; ⛏ руда: <b>{ore} м³</b>":"Target: <b>{q} × {name}</b> &nbsp;·&nbsp; ⛏ ore: <b>{ore} m³</b>",
  " &nbsp;·&nbsp; <span class=\"lootw\">🎁 лут: {v} м³</span>":" &nbsp;·&nbsp; <span class=\"lootw\">🎁 loot: {v} m³</span>",
  " &nbsp;·&nbsp; время: <b>{time}</b>":" &nbsp;·&nbsp; time: <b>{time}</b>",
  "Стоимость фита (корабль + {n} мод.): ⛏ руда <b>{ore} м³</b>":"Fit cost (ship + {n} mod): ⛏ ore <b>{ore} m³</b>",
  " · 🎁 лут <b>{loot} м³</b>":" · 🎁 loot <b>{loot} m³</b>"," · видов сырья <b>{n}</b>":" · raw kinds <b>{n}</b>",
  "✓ выгодно":"✓ cheapest","+{n} лут":"+{n} loot","+лут":"+loot","Слот {s} {i} — выбери модуль:":"Slot {s} {i} — choose a module:","{n} из {m}":"{n} of {m}",
  " — отметь одну из: {list}":" — pick one of: {list}","Поиск «{q}»":"Search «{q}»",
};
function applyStatic(){
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach((e)=>{ e.textContent = i18n(e.getAttribute("data-i18n")); });
  document.querySelectorAll("[data-i18n-ph]").forEach((e)=>{ e.setAttribute("placeholder", i18n(e.getAttribute("data-i18n-ph"))); });
  document.querySelectorAll("[data-i18n-title]").forEach((e)=>{ e.setAttribute("title", i18n(e.getAttribute("data-i18n-title"))); });
  document.querySelectorAll(".langsw [data-lang]").forEach((b)=>b.classList.toggle("on", b.dataset.lang===LANG));
}
function setLang(l){
  if(l===LANG) return;
  LANG = l; try{ localStorage.setItem("ef_lang", l); }catch(e){}
  applyStatic();
  if(!DATA) return;
  renderCats(); updateViewBtns(); renderItems(); renderCrumbs();
  const h=(location.hash||"").replace("#","");
  if(h==="ships") shipsCompare();
  else if(fitMode && selected!=null) showFit(selected);
  else if(selected!=null) showDetail(selected);
}

// ── иконки ───────────────────────────────────────────
function icon(id, size){
  size = size||32;
  const t = ty(id);
  const wrap = el("span","ic"); wrap.style.width=wrap.style.height=size+"px";
  if(t.icon){
    const img = new Image(); img.width=img.height=size; img.loading="lazy"; img.src=ICONS+id+".png";
    img.onerror = ()=>{ try{ img.replaceWith(ph(t,size)); }catch(e){} };
    wrap.appendChild(img);
  } else wrap.appendChild(ph(t,size));
  return wrap;
}
function ph(t,size){
  const d = el("span","ph"); d.style.width=d.style.height=size+"px";
  d.style.background = CAT_COLOR[t.cat]||CAT_COLOR.Unknown;
  d.style.fontSize = Math.round(size*0.4)+"px";
  d.textContent = (t.name||"?").replace(/[^A-Za-zА-Яа-я0-9]/g,"").slice(0,2).toUpperCase() || "?";
  d.title = t.name; return d;
}
// ── табы карточки предмета: host получает .tabs (кнопки) + .tabpanels ──
function makeTabs(host){
  const bar = el("div","tabs"); const panels = el("div","tabpanels");
  host.appendChild(bar); host.appendChild(panels);
  const tabs = [];
  function activate(i){
    tabs.forEach((x,j)=>{ x.btn.classList.toggle("on", j===i); x.panel.hidden = j!==i; });
    const t = tabs[i]; if(!t) return; detailTab = i;
    if(t.lazy){ const fn=t.lazy; t.lazy=null; fn(t.panel); }   // отрисовать при первом показе (контейнер виден — важно для cytoscape/drawflow)
  }
  return {
    bar, count: ()=> tabs.length, activate,
    add(label, content, title){
      const idx = tabs.length;
      const btn = el("button","tab", esc(label)); btn.onclick = ()=> activate(idx);
      const panel = el("div","tabpanel");
      if(title) panel.appendChild(el("div","tabhead", esc(title)));   // подзаголовок-заголовок содержимого таба
      const rec = { btn, panel };
      if(typeof content === "function") rec.lazy = content; else panel.appendChild(content);   // функция = ленивый рендер
      bar.appendChild(btn); panels.appendChild(panel);
      tabs.push(rec);
      return idx;
    },
  };
}

