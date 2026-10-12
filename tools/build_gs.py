# -*- coding: utf-8 -*-
"""Gabungkan tools/core.gs + data/rubrik-standar.json menjadi apps-script/Code.gs (satu file siap tempel)."""
import json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
core = open(os.path.join(root, "tools", "core.gs"), encoding="utf-8").read()
seed = json.load(open(os.path.join(root, "data", "rubrik-standar.json"), encoding="utf-8"))
os.makedirs(os.path.join(root, "apps-script"), exist_ok=True)
with open(os.path.join(root, "apps-script", "Code.gs"), "w", encoding="utf-8") as f:
    f.write(core.rstrip() + "\n\n/* ============ RUBRIK STANDAR (Pedoman OSCE Vokasi Gizi 2023) ============ */\n")
    f.write("var SEED_RUBRIK = " + json.dumps(seed, ensure_ascii=False, indent=1) + ";\n")
print("apps-script/Code.gs ditulis")
