#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RealmCraft - Wuerfelhelfer fuer die offenen Aktionen ("To-Dos") einer Runde.

Liest savegame.json, nimmt die gewaehlten Aktionen mit offenem Wurf als To-Dos,
wirft fuer jede ein 1d10, rechnet Wurf + Modifikator gegen den Zielwert nach den
RealmCraft-Regeln und zeigt eine schoene Uebersicht. Das Skript schreibt nichts
zurueck - die Folgen deutet der Chronist; dies ist nur dein Wuerfelbecher.

Regeln (docs/Spielmechanik.md):
  * 1d10, der/die Spieler:in wuerfelt selbst - hier uebernimmt das der Becher.
  * Eine gewuerfelte 1 ist immer ein kritischer Rueckschlag, eine 10 immer ein
    kritischer Gluecksfall, unabhaengig vom Modifikator.
  * Sonst zaehlt Wurf + Mod gegen den Zielwert; die Hoehe der Differenz (Marge)
    sagt, wie gut oder schlecht es ausgeht.

Aufruf:
    python tools/wuerfeln.py                 # rollt die offenen To-Dos
    python tools/wuerfeln.py --seed 42       # reproduzierbar (zum Testen)
    python tools/wuerfeln.py --file pfad.json
    python tools/wuerfeln.py --all           # auch freie Aktionen (ohne Wurf) zeigen
"""

import argparse
import json
import random
import sys
from pathlib import Path

# Windows-Konsole auf UTF-8, damit Umlaute und Rahmenlinien sauber erscheinen.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

W = 64  # Innenbreite der Rahmen


def signed(mod):
    """+1 / ±0 / -2 als kurze, lesbare Zeichenkette."""
    if mod == 0:
        return "±0"
    return f"+{mod}" if mod > 0 else f"{mod}"


def clip(text, width):
    text = text or ""
    return text if len(text) <= width else text[: width - 1] + "…"


def klassifiziere(wurf, mod, ziel):
    """Gibt (kuerzel, label, detail) nach den RealmCraft-Regeln zurueck."""
    if wurf == 1:
        return ("!!", "Kritischer Rückschlag", "natürliche 1 — ein böser Fund")
    if wurf == 10:
        return ("**", "Kritischer Glücksfall", "natürliche 10 — alles geht auf")
    summe = wurf + mod
    marge = summe - ziel
    if marge <= -3:
        return ("--", "Schwerer Fehlschlag", f"{summe} gegen {ziel}, Marge {marge}")
    if marge < 0:
        return ("-", "Fehlschlag", f"{summe} gegen {ziel}, Marge {marge}")
    if marge == 0:
        return ("=", "Gerade geschafft", f"{summe} gegen {ziel}, kleiner Preis")
    if marge <= 2:
        return ("+", "Erfolg", f"{summe} gegen {ziel}, Marge +{marge}")
    return ("++", "Klarer Erfolg", f"{summe} gegen {ziel}, Marge +{marge}")


def welt_band(w):
    """Deutung eines Weltereignis-Wurfs (1d10): niedrig schlimm, hoch guenstig."""
    if w == 1:
        return ("Katastrophe", "ein schwerer Schlag trifft das Volk")
    if w in (2, 3):
        return ("Unglück", "es läuft schlecht, ein echter Rückschlag")
    if w in (4, 5):
        return ("Zwielicht", "gemischt, eher ungünstig")
    if w in (6, 7):
        return ("Ruhig", "wenig geschieht, ein Hauch von Gunst")
    if w in (8, 9):
        return ("Gunst", "das Glück neigt sich euch zu")
    return ("Großer Glücksfall", "ein seltenes Geschenk der Welt")


def box_top(title):
    print("╔" + "═" * W + "╗")
    print("║ " + clip(title, W - 2).ljust(W - 2) + " ║")
    print("╚" + "═" * W + "╝")


def lade(pfad):
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description="RealmCraft Wuerfelhelfer")
    ap.add_argument("--file", default=None, help="Pfad zu savegame.json")
    ap.add_argument("--seed", type=int, default=None, help="fester Seed (reproduzierbar)")
    ap.add_argument("--all", action="store_true", help="auch freie Aktionen ohne Wurf zeigen")
    ap.add_argument("--weltereignis", action="store_true", help="wirft ein Weltereignis (1d10) beim Saison-Wechsel")
    args = ap.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    if args.weltereignis:
        w = random.randint(1, 10)
        label, detail = welt_band(w)
        box_top("Weltereignis · 1d10")
        print()
        print(f"    Wurf  d10 = {w}")
        print(f"    ►  {label.upper()}   ({detail})")
        print()
        print("  Der Chronist gibt dem Wurf konkrete Gestalt aus den offenen Fäden.")
        return

    pfad = Path(args.file) if args.file else Path(__file__).resolve().parent.parent / "savegame.json"
    if not pfad.exists():
        print(f"Kein Speicherstand gefunden: {pfad}")
        sys.exit(1)

    stand = lade(pfad)
    meta = stand.get("meta", {})
    zeit = meta.get("zeit", {})
    titel = f"{meta.get('spielname','RealmCraft')} · {zeit.get('jahreszeit','')} Jahr {zeit.get('jahr','')} · Würfelhelfer"

    runde = stand.get("runde", {})
    aktionen = runde.get("aktionen", [])

    # To-Dos: gewaehlt und Wurf noch offen.
    todos = [a for a in aktionen if a.get("status") == "gewaehlt" and a.get("wurf") in (None, "")]
    mit_wurf = [a for a in todos if isinstance(a.get("ziel"), int)]
    frei = [a for a in todos if not isinstance(a.get("ziel"), int)]

    box_top(titel)
    haupt = runde.get("haupt", {})
    neben = runde.get("neben", {})
    print(f"  Budget: Haupt {haupt.get('used',0)}/{haupt.get('max',0)}   "
          f"Neben {neben.get('used',0)}/{neben.get('max',0)}")
    print()

    if not mit_wurf:
        print("  Keine offenen Würfe. Alle To-Dos dieser Runde sind erledigt.")
        return

    ergebnisse = []
    for i, a in enumerate(mit_wurf, 1):
        art = "Hauptaktion" if a.get("art") == "haupt" else "Nebenaktion"
        ziel = a["ziel"]
        mod = a.get("mod", 0) or 0
        wurf = random.randint(1, 10)
        kuerzel, label, detail = klassifiziere(wurf, mod, ziel)
        ergebnisse.append((a, art, ziel, mod, wurf, kuerzel, label, detail))

        print(f"  To-Do {i} · {art}")
        print(f"    {clip(a.get('titel',''), W)}  —  {clip(a.get('kern',''), W-6)}")
        print(f"    Ziel {ziel}   Mod {signed(mod)}")
        if wurf in (1, 10):
            print(f"    Wurf  d10 = {wurf}")
        else:
            print(f"    Wurf  d10 = {wurf}   →   {wurf} {signed(mod)} = {wurf+mod}   gegen {ziel}")
        print(f"    ►  {label.upper()}   ({detail})")
        print()

    # Kompakte Schluss-Übersicht.
    print(" ┌─ Übersicht " + "─" * (W - 12) + "┐")
    for a, art, ziel, mod, wurf, kuerzel, label, detail in ergebnisse:
        h = "H" if art == "Hauptaktion" else "N"
        titel_sp = clip(a.get("titel", ""), 22).ljust(22)
        zeile = (f" {h}  {titel_sp} Ziel {ziel}  Mod {signed(mod):>3}  "
                 f"d10 {wurf:>2}  {kuerzel:>2}  {clip(label, 18)}")
        print(" │" + zeile.ljust(W) + "│")
    print(" └" + "─" * W + "┘")

    if frei:
        print()
        print("  Frei, ohne Wurf:")
        for a in frei:
            print(f"    • {clip(a.get('titel',''), W)} — {clip(a.get('kern',''), W)}")

    print()
    print("  Hinweis: Die Würfe stehen. Die Folgen deutet der Chronist und")
    print("  trägt das offizielle Ergebnis in den Speicherstand ein.")


if __name__ == "__main__":
    main()
