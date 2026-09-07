#!/usr/bin/env python3
"""Soumet toutes les URL du sitemap à IndexNow (Bing, Yandex, Seznam, Naver…). À lancer après chaque publication.
Usage : python seo/indexnow.py
"""
import re
import urllib.request
import json
from pathlib import Path

KEY = Path(__file__).with_name("indexnow.env").read_text().strip().split("=", 1)[1]
HOST = "xn--marcho-fva.fr"   # IndexNow exige l'hôte en ASCII (punycode de marchéo.fr)

xml = urllib.request.urlopen(f"https://{HOST}/sitemap.xml", timeout=30).read().decode("utf-8")
urls = [u.replace("https://marchéo.fr", f"https://{HOST}") for u in re.findall(r"<loc>([^<]+)</loc>", xml)]
body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls}).encode("utf-8")
req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"})
with urllib.request.urlopen(req, timeout=30) as r:
    print(f"IndexNow : HTTP {r.status} · {len(urls)} URL soumises")
