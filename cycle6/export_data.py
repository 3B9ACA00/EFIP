# Экспорт данных Цикла 6 (Sanctuary) в data.json.
# Источник — decoded SDE билда 3409470-v2026.06 (CCP loader.pyd) + atlas sqlite (имена/группы).
# Отличие от Цикла 5: кораблей-предметов НЕТ — есть ОДНА база (creation_templates) + модули
# (creation_modules), которые ставятся в сетку cells. Раздел «Верфь» это и показывает.
import sqlite3, json, os, datetime

HERE  = os.path.dirname(os.path.abspath(__file__))
BUILD = os.environ.get('EF_BUILD', '3409470-v2026.06')
DB    = os.environ.get('EF_DB',  r'C:\Users\user\APPS\EF\ef-atlas\data\%s.sqlite' % BUILD)
SDE   = os.environ.get('EF_SDE', r'C:\Users\user\APPS\EF\ef-atlas\builds\%s\sde' % BUILD)
OUT   = os.path.join(HERE, 'data.json')
ICONS = os.path.join(HERE, 'icons')
def has_icon(tid): return 1 if os.path.exists(os.path.join(ICONS, '%d.png' % tid)) else 0
def L(f): return json.load(open(os.path.join(SDE, f), encoding='utf-8'))

con = sqlite3.connect(DB); cur = con.cursor()
NM  = {m: t for m, t in cur.execute("SELECT message_id,text FROM name_strings WHERE locale='en-us'")}
TYPE = {}                                  # tid -> {name, gid}
for tid, nid, gid in cur.execute("SELECT type_id,type_name_id,group_id FROM sde_types"):
    TYPE[tid] = {'name': NM.get(nid, '#%d' % tid), 'gid': gid}
GRP = {}                                   # gid -> {name, cid}
for gid, gnid, cid in cur.execute("SELECT group_id,group_name_id,category_id FROM sde_groups"):
    GRP[gid] = {'name': NM.get(gnid, 'grp%d' % gid), 'cid': cid}
CAT = {cid: NM.get(cnid, 'cat%d' % cid)
       for cid, cnid in cur.execute("SELECT category_id,category_name_id FROM sde_categories")}

TJ = L('types.json')                       # volume/mass per type
def nm(tid):  return TYPE.get(tid, {}).get('name', '#%d' % tid)
def grp(tid):
    g = TYPE.get(tid, {}).get('gid'); return GRP.get(g, {}).get('name', '') if g else ''
def cat(tid):
    g = TYPE.get(tid, {}).get('gid'); cid = GRP.get(g, {}).get('cid') if g else None
    return CAT.get(cid, 'Unknown') if cid is not None else 'Unknown'
def vol(tid):  return TJ.get(str(tid), {}).get('volume') or 0
def mass(tid): return TJ.get(str(tid), {}).get('mass') or 0

# ---------- рецепты (industry_blueprints) ----------
bpj = L('industry_blueprints.json')
recipes = []
for bid, info in bpj.items():
    recipes.append({
        'bp':  int(bid),
        'inp': [{'id': m['typeID'], 'q': m['quantity']} for m in info.get('inputs', [])],
        'out': [{'id': p['typeID'], 'q': p['quantity']} for p in info.get('outputs', [])],
        'rt':  info.get('runTime', 0),
        'prim': info.get('primaryTypeID'),
    })
# постройки (Deployable) — рецепты из spacecomponentsbytype.json → assemblyConstruction
# (строятся в base building, их НЕТ в industry_blueprints). recipe_type_id → constructedItem.
spc = L('spacecomponentsbytype.json')
n_dep = 0
for tid_s, comps in spc.items():
    ac = comps.get('assemblyConstruction') if isinstance(comps, dict) else None
    if not isinstance(ac, dict):   # в билде 3409470 — непрозрачный placeholder (loader не отдаёт); пропускаем
        continue
    ci = ac.get('constructedItem')
    inp = [{'id': int(k), 'q': q} for k, q in ac.get('inputItems', {}).items()]
    if ci is None or not inp:
        continue
    recipes.append({'bp': int(tid_s), 'inp': inp, 'out': [{'id': int(ci), 'q': 1}],
                    'rt': 0, 'prim': int(ci), 'build': 1})
    n_dep += 1

facj = L('industry_facilities.json')
facilities = {}; bp2fac = {}
for fid_s, fi in facj.items():
    fid = int(fid_s)
    facilities[fid] = {'id': fid, 'inCap': fi.get('inputCapacity'), 'outCap': fi.get('outputCapacity')}
    for b in fi.get('blueprints', []):
        bp2fac.setdefault(b['blueprintID'], set()).add(fid)
for v in recipes:
    v['fac'] = sorted(bp2fac.get(v['bp'], []))
out2bp = {}                                # output type -> bp (рецепт модуля)
for v in recipes:
    for o in v['out']:
        out2bp.setdefault(o['id'], v['bp'])

# ---------- догма (характеристики для конструктора) ----------
DOGMA = L('typeDogma.json')
DA    = L('dogmaAttributes.json')
AN    = {int(k): v.get('name') for k, v in DA.items() if v.get('name')}
def stats_of(tid):
    d = DOGMA.get(str(tid), {})
    out = {}
    for a in d.get('dogmaAttributes', []):
        nm2 = AN.get(a['attributeID'])
        if nm2 is not None and a.get('value') is not None:
            out[nm2] = a['value']
    return out

# ---------- ВЕРФЬ (creation_*) ----------
mods_j  = L('creation_modules.json')
tmpl_j  = L('creation_templates.json')
parts_j = L('creation_parts.json')         # keyed by graphic_id
hp_j    = L('creation_hardpoint_types.json')

def bbox(cells):
    if not cells: return [0, 0]
    xs = [c['x'] for c in cells]; ys = [c['y'] for c in cells]
    return [max(xs) - min(xs) + 1, max(ys) - min(ys) + 1]

modules = []
for tid_s, m in mods_j.items():
    tid = int(tid_s)
    pl  = m.get('placement', {})
    hp  = pl.get('hardpoints') or pl.get('compatible_hardpoints') or []
    cells = pl.get('occupancy', {}).get('cells', [])
    modules.append({
        'id': tid, 'name': nm(tid), 'cap': m.get('capability'), 'beh': m.get('behavior'),
        'sys': m.get('system'), 'hp': sorted(set(hp)), 'cells': cells, 'bbox': bbox(cells),
        'bp': out2bp.get(tid), 'stats': stats_of(tid),
    })

base = None
for tid_s, t in tmpl_j.items():
    parts = []
    for pid, p in t.get('parts', {}).items():
        g = p.get('graphic_id')
        cp = parts_j.get(str(g), {})
        parts.append({'pid': int(pid), 'gid': g, 'pos': p.get('position'),
                      'cells': cp.get('cells', []), 'hp': cp.get('hardpoints', []),
                      'off': cp.get('cell_offset')})
    base = {
        'id':   int(tid_s),
        'fuel': {'id': t['fuel']['type_id'], 'name': nm(t['fuel']['type_id'])},
        'parts': parts,
        'interior': [{'id': im['type_id'], 'name': nm(im['type_id']), 'pid': im.get('part_id'),
                      'pos': im.get('position'), 'hp': im.get('hardpoints', []), 'stats': stats_of(im['type_id'])}
                     for im in t.get('interior_modules', [])],
        'fuel_stats': stats_of(t['fuel']['type_id']),
    }
    break
shipyard = {'base': base, 'modules': modules, 'hardpoints': hp_j}

# ---------- каталог типов (релевантные: из рецептов + модули + база) ----------
ref = set()
for v in recipes:
    for x in v['inp'] + v['out']:
        ref.add(x['id'])
ref |= set(facilities)
ref |= {m['id'] for m in modules}
if base:
    ref.add(base['fuel']['id'])
    ref |= {i['id'] for i in base['interior']}
types = {}
for tid in sorted(ref):
    types[tid] = {'id': tid, 'name': nm(tid), 'cat': cat(tid), 'grp': grp(tid),
                  'vol': vol(tid), 'mass': mass(tid), 'icon': has_icon(tid)}

craftable = sorted({x['id'] for v in recipes for x in v['out']})
data = {
    'meta': {'generated': datetime.date.today().isoformat(), 'cycle': 6, 'source': 'decoded SDE %s' % BUILD,
             'types': len(types), 'recipes': len(recipes), 'craftable': len(craftable),
             'facilities': len(facilities), 'modules': len(modules)},
    'types': list(types.values()),
    'recipes': recipes,
    'facilities': facilities,
    'shipyard': shipyard,
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print("wrote", OUT, os.path.getsize(OUT), "bytes")
print("types=%d recipes=%d craftable=%d facilities=%d modules=%d parts=%d"
      % (len(types), len(recipes), len(craftable), len(facilities), len(modules), len(base['parts']) if base else 0))
