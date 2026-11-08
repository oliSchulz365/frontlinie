# Frontlinie

Eigenständiges Strategiespiel als PWA für das iPad: **Eisenbund (Blau) gegen Kronland (Rot)**.
Rundenbasierte Strategiekarte plus Echtzeit-Schlachten per Touch.

## Spielen
- **1 Spieler** gegen den Computer oder **2 Spieler** an einem iPad
- Ziel: die gegnerische Hauptstadt (★) erobern
- Karte: 3 Züge pro Runde, Bahnhöfe liefern Nachschub, „Halbe Armee“ lässt Truppen zurück
- Schlacht: Infanterie, Kavallerie, Artillerie. Antippen = auswählen, Boden = marschieren, Gegner = angreifen, Ziehen geht auch. Zeitlimit 3 Minuten, danach hält der Verteidiger.
- Spielstand wird automatisch im Browser gespeichert

## Aufs iPad bringen
1. Repository auf GitHub Pages veröffentlichen (Settings → Pages → Branch `main`, Ordner `/`).
2. Die Pages-URL auf dem iPad in **Safari** öffnen.
3. **Teilen → Zum Home-Bildschirm**. Danach startet Frontlinie im Vollbild und läuft offline.

## Technik
- Reines HTML5-Canvas + JavaScript, keine Abhängigkeiten, kein Build-Schritt
- `index.html`, `game.js` (Spiel), `sw.js` (Offline-Cache), `manifest.webmanifest`, `icons/`
- Lokal testen: `python3 -m http.server` im Projektordner, dann `http://localhost:8000`
- Nach Änderungen `VERSION` in `sw.js` erhöhen, damit installierte Apps das Update laden

## Ausbaustufen (geplant)
- Zwischenspiele: Zugüberfall, Festungssturm
- Wetter und Gelände mit Spielwirkung
- Mehrere Karten und Schwierigkeitsstufen
