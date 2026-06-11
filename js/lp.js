"use strict";
// LP-солвер для plan(). Основной — jsLPSolver (window.solver из vendor/lp-solver.js, проверенный симплекс/MILP);
// fallback — встроенный двухфазный симплекс (node-тесты / если вендор не загрузился).
//   lpSolve(vars:string[], obj:{name:coef}, cons:[{coefs:{name:coef}, rel:'>='|'<='|'=', rhs:number}])
//   -> { ok:boolean, val:{name:value}, cost:number }
function lpSolve(vars, obj, cons){
  if(typeof solver !== "undefined" && solver && solver.Solve){
    const model={ optimize:"_cost", opType:"min", constraints:{}, variables:{} };
    vars.forEach((v)=>{ model.variables[v]={ _cost: obj[v]||0 }; });
    cons.forEach((c,i)=>{ const cn="_c"+i;
      model.constraints[cn] = c.rel===">=" ? {min:c.rhs} : c.rel==="<=" ? {max:c.rhs} : {equal:c.rhs};
      for(const v in c.coefs){ if(model.variables[v]) model.variables[v][cn]=(model.variables[v][cn]||0)+c.coefs[v]; }
    });
    const r=solver.Solve(model);
    if(!r || !r.feasible) return { ok:false, val:{}, cost:Infinity };
    const val={}; vars.forEach((v)=> val[v]= +r[v]||0);
    return { ok:true, val, cost:+r.result||0 };
  }
  return simplexSolve(vars, obj, cons);
}
// fallback: встроенный двухфазный симплекс (правило Бланда от зацикливания), min cᵀx при (>=,<=,=), x>=0
function simplexSolve(vars, obj, cons){
  const EPS = 1e-7;
  const nOrig = vars.length;
  const colOf = {}; vars.forEach((v,i)=> colOf[v]=i);
  // 1) нормализуем строки (rhs >= 0)
  const rows = cons.map((c)=>{
    let rel=c.rel, rhs=+c.rhs||0; const co={};
    for(const k in c.coefs) co[k]=c.coefs[k];
    if(rhs < 0){ rhs=-rhs; rel = rel===">="?"<=" : rel==="<="?">=" : "="; for(const k in co) co[k]=-co[k]; }
    return { co, rel, rhs };
  });
  const m = rows.length;
  // 2) доп. столбцы: slack(<=), surplus+art(>=), art(=)
  const addl = [];
  rows.forEach((r,i)=>{
    if(r.rel === "<=") addl.push({type:"slack", row:i});
    else if(r.rel === ">="){ addl.push({type:"surplus", row:i}); addl.push({type:"art", row:i}); }
    else addl.push({type:"art", row:i});
  });
  const nTot = nOrig + addl.length;
  const isArt = new Array(nTot).fill(false);
  // 3) тэблица m × (nTot+1); последний столбец — RHS
  const T = [];
  for(let i=0;i<m;i++){ const row = new Array(nTot+1).fill(0);
    for(const k in rows[i].co){ if(colOf[k]!=null) row[colOf[k]] = rows[i].co[k]; }
    row[nTot] = rows[i].rhs; T.push(row);
  }
  const basis = new Array(m).fill(-1);
  addl.forEach((a,j)=>{ const col = nOrig + j;
    T[a.row][col] = (a.type==="surplus") ? -1 : 1;
    if(a.type==="art"){ isArt[col]=true; basis[a.row]=col; }
    else if(a.type==="slack") basis[a.row]=col;
  });
  // симплекс по строке стоимости (минимизация); banArt — запрет входа артифишелам
  function runSimplex(cost, banArt){
    const z = cost.slice(); z.push(0);
    for(let i=0;i<m;i++){ const f=z[basis[i]]; if(Math.abs(f)>EPS){ for(let j=0;j<=nTot;j++) z[j]-=f*T[i][j]; } }
    for(let iter=0; iter<20000; iter++){
      let pc=-1;
      for(let j=0;j<nTot;j++){ if(banArt && isArt[j]) continue; if(z[j] < -EPS){ pc=j; break; } }
      if(pc<0) return true;
      let pr=-1, best=Infinity;
      for(let i=0;i<m;i++){ const a=T[i][pc]; if(a > EPS){ const ratio=T[i][nTot]/a;
        if(ratio < best - EPS){ best=ratio; pr=i; }
        else if(Math.abs(ratio-best) < EPS && (pr<0 || basis[i] < basis[pr])) pr=i; } }
      if(pr<0) return false;   // неограниченно
      const piv=T[pr][pc]; for(let j=0;j<=nTot;j++) T[pr][j]/=piv;
      for(let i=0;i<m;i++){ if(i!==pr){ const f=T[i][pc]; if(Math.abs(f)>EPS){ for(let j=0;j<=nTot;j++) T[i][j]-=f*T[pr][j]; } } }
      const fz=z[pc]; if(Math.abs(fz)>EPS){ for(let j=0;j<=nTot;j++) z[j]-=fz*T[pr][j]; }
      basis[pr]=pc;
    }
    return true;
  }
  // фаза 1: минимизировать сумму артифишелов
  if(isArt.some(Boolean)){
    const c1 = new Array(nTot).fill(0); for(let j=0;j<nTot;j++) if(isArt[j]) c1[j]=1;
    runSimplex(c1, false);
    let artSum=0; for(let i=0;i<m;i++){ if(isArt[basis[i]]) artSum += T[i][nTot]; }
    if(artSum > 1e-5) return { ok:false, val:{}, cost:Infinity };
    // выгнать базисные артифишелы (вырожденные, на нуле) — иначе блокируют оптимизацию фазы 2
    for(let i=0;i<m;i++){ if(isArt[basis[i]]){
      let col=-1; for(let j=0;j<nTot;j++){ if(!isArt[j] && Math.abs(T[i][j])>EPS){ col=j; break; } }
      if(col>=0){ const piv=T[i][col]; for(let j=0;j<=nTot;j++) T[i][j]/=piv;
        for(let r=0;r<m;r++){ if(r!==i){ const f=T[r][col]; if(Math.abs(f)>EPS){ for(let j=0;j<=nTot;j++) T[r][j]-=f*T[i][j]; } } }
        basis[i]=col; } } }
  }
  // фаза 2: реальная цель, артифишелы запрещены к входу
  const c2 = new Array(nTot).fill(0); for(const v in obj){ if(colOf[v]!=null) c2[colOf[v]]=obj[v]; }
  runSimplex(c2, true);
  const val={}; vars.forEach((v)=> val[v]=0);
  for(let i=0;i<m;i++){ if(basis[i] < nOrig) val[vars[basis[i]]] = Math.max(0, T[i][nTot]); }
  let cost=0; for(const v in obj) cost += obj[v]*(val[v]||0);
  return { ok:true, val, cost };
}
if(typeof module!=="undefined") module.exports = { lpSolve, simplexSolve };
