# EF Industry

Crafting & resource planner for **EVE Frontier** — vanilla JS, zero‑build static web app.

## Features
- **Global ore‑optimal planning** via linear programming: minimise mined‑ore volume *or* production time across the whole bill‑of‑materials (handles joint by‑products & recipe splits — not greedy).
- Recipe variants switcher, reprocessing, stock ("склад") that subtracts from the plan.
- Production flow graphs (custom / D3 / Cytoscape), EN / RU.

## Run locally
```
python serve.py          # → http://localhost:8099
```
(`serve.py` serves with no‑cache headers; plain `python -m http.server 8099` also works.)

## Data
`data.json` is decoded from the EVE Frontier SDE via `export_data.py`; item icons are extracted from the game client via `extract_icons.py`. All game data & icons are © CCP Games (EVE Frontier).
