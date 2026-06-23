// ── сравнительная таблица кораблей ───────────────────
function shipsCompare(){
  selected = null; fitMode = false; listMode = false; updateListNav();
  if(location.hash !== "#ships") location.hash = "#ships";
  const allShips = DATA.types.filter((t)=>t.cat==="Ship");
  const d = $("#detail"); d.innerHTML = "";
  d.appendChild(el("div","dname", i18n("🚀 Сравнение кораблей")));
  d.appendChild(el("div","dmeta",i18n("Корабли — в колонках. Клик по показателю — сортировка, по кораблю — открыть. Зелёным — лучшее в строке (для инерции и сигнатуры меньшее = лучше).")));

  const COLS = [
    {g:"Слоты", items:[
      {k:"hi",t:"High",s:"slot",dir:"max"},{k:"med",t:"Med",s:"slot",dir:"max"},{k:"low",t:"Low",s:"slot",dir:"max"},
      {k:"engine",t:"Engine",s:"slot",dir:"max"},{k:"turret",t:"Turret",s:"slot",dir:"max"},{k:"launcher",t:"Launcher",s:"slot",dir:"max"},
    ]},
    {g:"Защита", items:[
      {k:"hp",t:"HP (корпус)",s:"attr",dir:"max"},{k:"armorHP",t:"Броня",s:"attr",dir:"max"},{k:"shieldCapacity",t:"Щит",s:"attr",dir:"max"},
    ]},
    {g:"Фиттинг", items:[
      {k:"powerOutput",t:"PowerGrid",s:"attr",dir:"max"},{k:"cpuOutput",t:"CPU",s:"attr",dir:"max"},{k:"capacitorCapacity",t:"Капаситор",s:"attr",dir:"max"},
    ]},
    {g:"Мобильность", items:[
      {k:"maxVelocity",t:"Скорость, м/с",s:"attr",dir:"max"},{k:"agility",t:"Инерция",s:"attr",dir:"min"},
      {k:"warpSpeedMultiplier",t:"Варп, ×",s:"attr",dir:"max"},{k:"signatureRadius",t:"Сигнатура, м",s:"attr",dir:"min"},
    ]},
    {g:"Вместимость", items:[
      {k:"cargo",t:"Карго, м³",s:"top",dir:"max"},{k:"fuelCapacity",t:"Топливо",s:"attr",dir:"max"},
      {k:"vol",t:"Объём, м³",s:"top",dir:null},{k:"mass",t:"Масса, кг",s:"top",dir:null},
    ]},
  ];
  const flat = COLS.flatMap((g)=>g.items);
  const getV = (s,c)=> c.s==="slot" ? (s.slots||{})[c.k] : c.s==="attr" ? (s.attrs||{})[c.k] : s[c.k];
  const GORD = ["Shuttle","Corvette","Frigate","Destroyer","Cruiser","Combat Battlecruiser"];
  const byGroup = (a,b)=>{ const r=((GORD.indexOf(a.grp)+1)||99)-((GORD.indexOf(b.grp)+1)||99); return r || a.name.localeCompare(b.name); };

  // ── тулбар: дропдаун скрытия кораблей + сброс сортировки ──
  const bar = el("div","cmpbar");
  const drop = el("details","cmpdrop");
  const sum = el("summary"); drop.appendChild(sum);
  const panel = el("div","cmpdroppanel");
  const allRow = el("label","cmprow allrow");
  const allCb = el("input"); allCb.type="checkbox";
  allRow.appendChild(allCb); allRow.appendChild(el("span",null,i18n(" показать все")));
  allCb.onchange = ()=>{ if(allCb.checked) cmpHidden.clear(); else allShips.forEach((s)=>cmpHidden.add(s.id)); buildPanel(); refresh(); };
  panel.appendChild(allRow);
  function buildPanel(){
    [...panel.querySelectorAll(".cmprow:not(.allrow)")].forEach((n)=>n.remove());
    allShips.slice().sort(byGroup).forEach((s)=>{
      const row=el("label","cmprow"); const cb=el("input"); cb.type="checkbox"; cb.checked=!cmpHidden.has(s.id);
      cb.onchange=()=>{ if(cb.checked) cmpHidden.delete(s.id); else cmpHidden.add(s.id); allCb.checked=cmpHidden.size===0; refresh(); };
      row.appendChild(cb); row.appendChild(el("span",null," "+esc(s.name))); row.appendChild(el("span","cmpg",esc(s.grp||""))); panel.appendChild(row);
    });
    allCb.checked = cmpHidden.size===0;
  }
  drop.appendChild(panel); bar.appendChild(drop);
  const resetSort = el("button","ghost"); resetSort.textContent=i18n("↕ по классу");
  resetSort.onclick = ()=>{ cmpSort=null; refresh(); };
  bar.appendChild(resetSort);
  d.appendChild(bar);

  const wrap = el("div","shipcmp"); d.appendChild(wrap);

  function visibleShips(){
    const list = allShips.filter((s)=>!cmpHidden.has(s.id));
    if(cmpSort){ const c=flat.find((x)=>x.k===cmpSort.key);
      list.sort((a,b)=>{ const va=getV(a,c), vb=getV(b,c); const na=(va==null||isNaN(va))?-Infinity:va, nb=(vb==null||isNaN(vb))?-Infinity:vb; return cmpSort.dir==="asc"? na-nb : nb-na; });
    } else list.sort(byGroup);
    return list;
  }
  function renderTable(){
    wrap.innerHTML="";
    const ships = visibleShips();
    if(!ships.length){ wrap.appendChild(el("div","cmpempty",i18n("Все корабли скрыты — отметь хотя бы один в «Корабли ▾»."))); return; }
    const best={};
    for(const c of flat){ if(!c.dir) continue;
      const vs=ships.map((s)=>getV(s,c)).filter((v)=>v!=null&&!isNaN(v));
      if(!vs.length) continue; const mx=Math.max(...vs), mn=Math.min(...vs); if(mx===mn) continue;
      best[c.k]= c.dir==="max"?mx:mn;
    }
    const tbl=el("table","shipcmptbl");
    const thead=el("thead"); const hr=el("tr");
    hr.appendChild(el("th","statcol corner",i18n("Показатель")));
    ships.forEach((s)=>{ const th=el("th","shipcol"); th.title=i18n("Открыть ")+s.name;
      th.appendChild(icon(s.id,24)); th.appendChild(el("div","shn",esc(s.name))); th.appendChild(el("div","shg",esc(s.grp||"")));
      th.style.cursor="pointer"; th.onclick=()=>showDetail(s.id); hr.appendChild(th); });
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb=el("tbody");
    COLS.forEach((g,gi)=>{
      const gr=el("tr","grpband b"+gi);
      const gtd=el("td","statcol"); gtd.textContent=i18n(g.g); gr.appendChild(gtd);
      const fill=el("td"); fill.colSpan=ships.length; gr.appendChild(fill); tb.appendChild(gr);
      g.items.forEach((c,ri)=>{
        const tr=el("tr","drow g"+gi+(ri%2?" z":""));
        const on = cmpSort && cmpSort.key===c.k;
        const std=el("td","statcol stat"+(on?" sorton":""));
        std.textContent = i18n(c.t) + (on ? (cmpSort.dir==="asc"?"  ▲":"  ▼") : "");
        std.style.cursor="pointer";
        std.onclick=()=>{ if(cmpSort && cmpSort.key===c.k) cmpSort.dir = cmpSort.dir==="asc"?"desc":"asc"; else cmpSort={key:c.k, dir:c.dir==="min"?"asc":"desc"}; refresh(); };
        tr.appendChild(std);
        ships.forEach((s)=>{ const v=getV(s,c); const isBest=c.dir && best[c.k]!=null && v===best[c.k];
          const td=el("td","v"+(isBest?" best":"")); td.textContent=(v==null)?(c.s==="slot"?"0":"—"):num(v); tr.appendChild(td); });
        tb.appendChild(tr);
      });
    });
    tbl.appendChild(tb); wrap.appendChild(tbl);
  }
  function refresh(){ sum.textContent = i18n("⚙ Корабли: {a}/{b} ▾", {a:allShips.length-cmpHidden.size, b:allShips.length}); renderTable(); }
  buildPanel(); refresh();
  d.scrollTop = 0;
}

