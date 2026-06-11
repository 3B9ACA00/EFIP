# Извлечение иконок предметов EVE Frontier из клиентских ResFiles в ef-industry/icons/.
# typeID -> iconID (types.json) -> iconFile res-path (iconIDs.json) -> ResFiles physical (resfileindex).
# Корабли (только graphicID) обрабатываются через graphic-icon путь, если он есть в индексе.
import json, os, shutil, re
G64 = {}  # graphicID -> res-path вида .../<gid>_64.png

SDE    = r'C:\SAND\EF\ef-atlas\builds\3366068-v2026.05\sde'
CLIENT = r'C:\CCP\EVE Frontier'
RES    = os.path.join(CLIENT, 'ResFiles')
OUT    = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')
os.makedirs(OUT, exist_ok=True)

types = json.load(open(SDE + r'\types.json', encoding='utf-8'))
icons = json.load(open(SDE + r'\iconIDs.json', encoding='utf-8'))
data  = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.json'), encoding='utf-8'))
ours  = [t['id'] for t in data['types']]

# resfileindex: res-path(lower) -> physical relative
idx = {}
for line in open(os.path.join(CLIENT, 'stillness', 'resfileindex.txt'), encoding='utf-8', errors='ignore'):
    p = line.split(',')
    if len(p) >= 2:
        idx[p[0].strip().lower()] = p[1].strip()

# предындекс ship/graphic иконок: .../<graphicID>_64.png (без _bp/_bpc)
_g64pat = re.compile(r'/(\d+)_64\.png$')
for rp in idx:
    m = _g64pat.search(rp)
    if m:
        G64.setdefault(int(m.group(1)), rp)

def copy_res(respath, tid):
    phys = idx.get(respath.lower())
    if not phys:
        return False
    src = os.path.join(RES, phys.replace('/', os.sep))
    try:
        shutil.copyfile(src, os.path.join(OUT, '%d.png' % tid))
        return True
    except Exception:
        return False

copied, ships_done, ship_ids, no_icon = 0, 0, [], []
for tid in ours:
    t = types.get(str(tid))
    if not t:
        no_icon.append(tid); continue
    iid = t.get('iconID')
    f = icons.get(str(iid), {}).get('iconFile') if iid else None
    if f and copy_res(f, tid):
        copied += 1
        continue
    gid = t.get('graphicID')
    if gid and gid in G64 and copy_res(G64[gid], tid):
        ships_done += 1; continue
    if gid:
        ship_ids.append(tid)
    else:
        no_icon.append(tid)

print("copied items: %d   ships via graphic: %d   ships missing: %d   no-icon: %d"
      % (copied, ships_done, len(ship_ids), len(no_icon)))
print("ship ids missing (sample):", ship_ids[:12])
print("total icons in folder:", len([f for f in os.listdir(OUT) if f.endswith('.png')]))
