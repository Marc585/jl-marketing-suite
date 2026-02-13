#!/usr/bin/env python3
"""
CI-Sync: Aktualisiert articles.json aus dem Shopware Produktfeed.

Wird von der GitHub Action "Sync Product Feed" ausgeführt.

Logik:
  - Bestehende Artikelnamen aus articles.json werden beibehalten
    (damit manuell korrigierte Namen nicht überschrieben werden)
  - Neue Artikel bekommen den Titel aus dem Feed
  - Gelöschte Artikel (nicht mehr im Feed) werden entfernt
  - Kategorien kommen immer frisch aus dem Feed
"""

import xml.etree.ElementTree as ET
import json
import os
import shutil
from datetime import date

FEED_FILE = "feed.xml"
OUTPUT_FILE = "articles.json"

CATEGORY_KEYWORDS = {
    "Haare": ["haare", "haar", "haarpflege", "shampoo", "conditioner", "spülung", "haarkur", "haarmaske", "leave-in", "haarspray", "locken", "volumen", "haarwäsche", "kopfhaut"],
    "Pflege": ["pflege", "körperpflege", "hautpflege"],
    "Pflege > Körper": ["körper", "body lotion", "bodylotion", "körperlotion", "body butter", "duschgel", "shower gel", "dusche", "peeling", "body oil", "körperöl", "badezusatz", "bath", "body wash", "schaumbad"],
    "Pflege > Hände": ["handpflege", "handcreme", "hand cream", "handbalsam", "hand balm", "hände"],
    "Pflege > Handseifen": ["handseife", "hand soap", "seife", "schaumseife", "handseifen"],
    "Pflege > Gesicht & Lippen": ["gesichtspflege", "gesicht", "face", "gesichtscreme", "face cream", "serum", "cleanser", "toner", "tagescreme", "nachtcreme", "day cream", "night cream", "reinigungsgel", "augenpflege", "eye cream"],
    "Pflege > Lippen": ["lip balm", "lip treatment", "lippenpflege", "lippen", "lip butter", "lippenbalsam", "lippenbalm"],
    "Pflege > Sonne": ["sonne", "sonnencreme", "sonnenmilch", "sunscreen", "spf", "lsf", "after sun", "sonnenschutz", "sonnenpflege", "aloe vera"],
    "Pflege > Deos": ["deo", "deodorant", "antitranspirant", "deos"],
    "Pflege > Kinder & Babys": ["kinder", "baby", "babys", "kids", "kind", "piraten", "feen", "sensibelchen"],
    "Pflege > Sets": ["set", "geschenkset", "giftbox", "geschenkbox", "bundle", "adventskalender"],
    "Home": ["home", "zuhause", "wohnung"],
    "Home > Raumduft & Kerzen": ["raumduft", "duftkerze", "kerze", "candle", "diffusor", "diffuser", "room diffuser", "aromatic", "atmosphere", "wäscheduft"],
    "Home > Handtücher": ["handtuch", "handtücher", "towel"],
    "Home > Reiniger": ["reiniger", "allzweckreiniger", "putzstein", "waschmittel", "weichspüler"],
    "Duft": ["duft", "parfum", "parfüm", "eau de toilette", "edt", "fragrance", "scent"],
    "Haare > Shampoo": ["shampoo", "haarshampoo", "haarwäsche"],
    "Haare > Conditioner": ["conditioner", "spülung", "haarspülung"],
    "Haare > Extrapflege": ["haarkur", "haarmaske", "leave-in", "haarspray", "extrapflege", "aufbauspray", "haaröl", "hair oil", "heat protection", "hitzeschutz"],
    "Sonstiges": ["sonstiges"],
}


def load_existing_names():
    """Bestehende Artikelnamen laden (für Name-Persistenz)."""
    if not os.path.exists(OUTPUT_FILE):
        return {}
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Backup für Change-Detection
    shutil.copy(OUTPUT_FILE, OUTPUT_FILE + ".bak")
    return {a["sku"]: a["name"] for a in data.get("articles", [])}


def parse_feed(existing_names):
    """Feed parsen und mit bestehenden Namen mergen."""
    root = ET.parse(FEED_FILE).getroot()
    articles = []
    kept = 0
    new = 0

    for product in root.findall("product"):
        sku = (product.findtext("ordernumber") or "").strip()
        feed_title = (product.findtext("title") or "").strip()
        feed_title = feed_title.replace(" | JeanLen", "").replace(" | Jean&Len", "").strip()
        availability = (product.findtext("availability") or "").strip()
        price = (product.findtext("price") or "").strip()
        sale_price = (product.findtext("sale_price") or "").strip()
        link = (product.findtext("link") or "").strip()
        gtin = (product.findtext("gtin") or "").strip()
        cat0 = (product.findtext("custom_label_0") or "").strip()
        cat1 = (product.findtext("custom_label_1") or "").strip().replace("&amp;", "&")

        if not sku or not feed_title:
            continue

        # Bestehenden Namen beibehalten, Feed-Titel nur für neue Artikel
        if sku in existing_names:
            name = existing_names[sku]
            kept += 1
        else:
            name = feed_title
            new += 1

        articles.append({
            "sku": sku,
            "name": name,
            "category": cat0 if cat0 else "Sonstiges",
            "subcategory": cat1 if cat1 else "",
            "availability": availability,
            "price": price,
            "salePrice": sale_price if sale_price else None,
            "url": link,
            "gtin": gtin,
        })

    articles.sort(key=lambda x: (x["category"], x.get("subcategory", ""), x["name"]))
    print(f"Feed: {len(articles)} Artikel ({kept} bestehend, {new} neu)")
    return articles


def generate_json(articles):
    """articles.json generieren."""
    data = {
        "meta": {
            "lastUpdated": str(date.today()),
            "totalArticles": len(articles),
            "source": "Shopware Feed (auto-sync)",
            "feedUrl": "https://www.jeanlen.de/store-api/product-export/SWPERW1QSK80Z1DSAHHWCDIZRA/chatchamp.xml",
        },
        "categoryKeywords": CATEGORY_KEYWORDS,
        "articles": articles,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"articles.json geschrieben: {len(articles)} Artikel")


if __name__ == "__main__":
    existing_names = load_existing_names()
    articles = parse_feed(existing_names)
    generate_json(articles)
    # Cleanup
    if os.path.exists(OUTPUT_FILE + ".bak"):
        os.remove(OUTPUT_FILE + ".bak")
    print("Fertig!")
