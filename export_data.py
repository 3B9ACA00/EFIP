# Экспорт данных индустрии EVE Frontier в data.json.
# ИСТОЧНИК РЕЦЕПТОВ — authoritative decoded SDE (через CCP loader.pyd), НЕ ручной cFSD-парсер:
#   industry_blueprints.json  — рецепты с multi-output (inputs[]/outputs[]/runTime).
#   industry_facilities.json  — в какой постройке какой blueprint производится.
# Имена/категории/объём типов — из frontier.sqlite (там уже резолвлены). Иконки — локальные (extract_icons.py).
import sqlite3, json, os, datetime

# Свежий билд берём из ef-atlas/builds/ (экстракция SDE: ef-atlas/scripts/extract-fsd.sh — CCP loader.pyd под Wine).
BUILD = os.environ.get('EF_BUILD', '3383973-v2026.05')
DB  = os.environ.get('EF_DB',  r'C:\Users\user\APPS\EF\ef-atlas\data\frontier.sqlite')
SDE = os.environ.get('EF_SDE', r'C:\SAND\EF\ef-atlas\builds\%s\sde' % BUILD)
SDE_BUILD = os.path.basename(os.path.dirname(SDE.replace('\\', '/').rstrip('/'))) or BUILD
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'data.json')
ICON_DIR = os.path.join(HERE, 'icons')
def has_icon(tid):
    return 1 if os.path.exists(os.path.join(ICON_DIR, '%d.png' % tid)) else 0

con = sqlite3.connect(DB); con.row_factory = sqlite3.Row; cur = con.cursor()

# --- dogma: слоты кораблей, слот-тип модулей, совместимость, характеристики (для фиттинга) ---
DOGMA = json.load(open(os.path.join(SDE, 'typeDogma.json'), encoding='utf-8'))
TYPES_SDE = json.load(open(os.path.join(SDE, 'types.json'), encoding='utf-8'))   # настоящий groupID
DA = json.load(open(os.path.join(SDE, 'dogmaAttributes.json'), encoding='utf-8'))
NAME2ID = {a.get('name'): int(aid) for aid, a in DA.items() if a.get('name')}
SHIP_SLOT_ATTR = {14:'hi', 13:'med', 12:'low', 5652:'engine', 102:'turret', 101:'launcher'}
MOD_SLOT_EFF = {11:'low', 12:'hi', 13:'med'}  # effectID; 12064 = engineSlot
CANFIT = {1298,1299,1300,1301,1872,1879,1880,1881,2065,2396} | set(range(2476, 2486))  # canFitShipGroup01..20
CHARGE_GROUP_ATTRS = {NAME2ID.get('chargeGroup%d' % i) for i in range(1, 6)} - {None}  # chargeGroup1..5 -> groupID зарядов
MOD_ATTRS = ['power','cpu','capacitorNeed','maxRange','damageMultiplier','trackingSpeed','reloadTime',
             'duration','speedFactor','armorHPBonusAdd','capacityBonus',
             'kineticDamageResistanceBonus','thermalDamageResistanceBonus',
             'explosiveDamageResistanceBonus','emDamageResistanceBonus',
             'rechargeRate','warpFuelRate','signatureEm','fuelRate']
SHIP_ATTRS = ['hp','armorHP','shieldCapacity','maxVelocity','powerOutput','cpuOutput',
              'capacitorCapacity','signatureRadius','agility','fuelCapacity','warpSpeedMultiplier']
FUEL_ATTRS = ['fuelEfficiency','fuelThermalInefficiency','fuelContainmentBurden']  # стат топлива (для сравнения)
def gid(tid):
    return TYPES_SDE.get(str(tid), {}).get('groupID')
def cargo_of(tid):
    return TYPES_SDE.get(str(tid), {}).get('capacity')
def ship_slots(tid):
    d = DOGMA.get(str(tid)) or {}
    out = {}
    for a in d.get('dogmaAttributes', []):
        s = SHIP_SLOT_ATTR.get(a.get('attributeID'))
        if s and a.get('value'):
            out[s] = int(a['value'])
    return out
def mod_slot(tid):
    d = DOGMA.get(str(tid)) or {}
    effs = [e.get('effectID') for e in d.get('dogmaEffects', [])]
    for e in effs:
        if e in MOD_SLOT_EFF: return MOD_SLOT_EFF[e]
    if 12064 in effs: return 'engine'
    return None
def mod_fit(tid):  # список groupID кораблей, на которые ставится (пусто = без ограничения)
    d = DOGMA.get(str(tid)) or {}
    fits = [int(a['value']) for a in d.get('dogmaAttributes', [])
            if a.get('attributeID') in CANFIT and a.get('value')]
    return sorted(set(fits))
def mod_charge_groups(tid):  # группы зарядов, которые принимает модуль (chargeGroup1..5 -> groupID зарядов)
    d = DOGMA.get(str(tid)) or {}
    g = [int(a['value']) for a in d.get('dogmaAttributes', [])
         if a.get('attributeID') in CHARGE_GROUP_ATTRS and a.get('value')]
    return sorted(set(g))
def attrs_of(tid, names):  # выбранные dogma-характеристики типа
    d = DOGMA.get(str(tid)) or {}
    am = {a.get('attributeID'): a.get('value') for a in d.get('dogmaAttributes', [])}
    out = {}
    for n in names:
        aid = NAME2ID.get(n)
        if aid is not None and am.get(aid) is not None:
            out[n] = am[aid]
    return out

# --- типы (каталог: имя, категория, группа, объём + слоты/слот для фиттинга) ---
types = {}
for r in cur.execute("select type_id,name,category_name,group_name,volume,mass from types"):
    rec = {
        'id': r['type_id'], 'name': r['name'],
        'cat': r['category_name'] or 'Unknown', 'grp': r['group_name'] or '',
        'vol': r['volume'] or 0, 'mass': r['mass'] or 0,
        'icon': has_icon(r['type_id']),
    }
    g = gid(r['type_id'])
    if g is not None: rec['gid'] = g
    if rec['cat'] == 'Ship':
        sl = ship_slots(r['type_id'])
        if sl: rec['slots'] = sl
        at = attrs_of(r['type_id'], SHIP_ATTRS)
        if at: rec['attrs'] = at
        cg = cargo_of(r['type_id'])
        if cg: rec['cargo'] = cg
    elif rec['cat'] == 'Module':
        ms = mod_slot(r['type_id'])
        if ms: rec['slot'] = ms
        f = mod_fit(r['type_id'])
        if f: rec['fit'] = f
        at = attrs_of(r['type_id'], MOD_ATTRS)
        if at: rec['attrs'] = at
        chg = mod_charge_groups(r['type_id'])
        if chg: rec['cg'] = chg
    else:
        fa = attrs_of(r['type_id'], FUEL_ATTRS)
        if fa: rec['attrs'] = fa
    types[r['type_id']] = rec

# --- рецепты из decoded industry_blueprints.json (multi-output) ---
bpj = json.load(open(os.path.join(SDE, 'industry_blueprints.json'), encoding='utf-8'))
recipes = []
for bid, info in bpj.items():
    recipes.append({
        'bp': int(bid),
        'inp': [{'id': m['typeID'], 'q': m['quantity']} for m in info.get('inputs', [])],
        'out': [{'id': p['typeID'], 'q': p['quantity']} for p in info.get('outputs', [])],
        'rt': info.get('runTime', 0),
        'prim': info.get('primaryTypeID'),
    })

# --- facility: в какой постройке производится каждый blueprint ---
facj = json.load(open(os.path.join(SDE, 'industry_facilities.json'), encoding='utf-8'))
facilities = {}; bp2fac = {}
for fid_s, fi in facj.items():
    fid = int(fid_s)
    facilities[fid] = {'id': fid, 'inCap': fi.get('inputCapacity'), 'outCap': fi.get('outputCapacity')}
    for b in fi.get('blueprints', []):
        bp2fac.setdefault(b['blueprintID'], set()).add(fid)
for v in recipes:
    v['fac'] = sorted(bp2fac.get(v['bp'], []))

# --- стабы для type_id из рецептов/построек, отсутствующих в types ---
ref_ids = set()
for v in recipes:
    for x in v['inp'] + v['out']:
        ref_ids.add(x['id'])
for fid in facilities:
    ref_ids.add(fid)
for tid in ref_ids:
    types.setdefault(tid, {'id': tid, 'name': '#%d' % tid, 'cat': 'Unknown', 'grp': '',
                           'vol': 0, 'mass': 0, 'icon': has_icon(tid)})

craftable = sorted({x['id'] for v in recipes for x in v['out']})
multi = sum(1 for v in recipes if len(v['out']) > 1)
data = {
    'meta': {'generated': datetime.date.today().isoformat(), 'source': 'decoded SDE %s' % SDE_BUILD,
             'types': len(types), 'recipes': len(recipes), 'craftable': len(craftable),
             'multi_output': multi, 'facilities': len(facilities)},
    'types': list(types.values()),
    'recipes': recipes,
    'facilities': facilities,
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print("wrote", OUT, os.path.getsize(OUT), "bytes")
print("types=%d recipes=%d craftable=%d multi_output=%d facilities=%d"
      % (len(types), len(recipes), len(craftable), multi, len(facilities)))
