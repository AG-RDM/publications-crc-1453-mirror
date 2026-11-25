# FREDATO Publications CRC 1453

Eine alternative, filterbare Darstellung der öffentlichen Publikationsliste
[`1453`](https://fredato-1453.imbi.uni-freiburg.de/public/publications/1453).

Die Website speichert keine Kopie der Publikationsdaten. Beim Aufruf lädt sie
alle Seiten der öffentlichen FREDATO-API direkt im Browser und zeigt daher den
jeweils aktuellen Stand. Die API-Seiten werden nacheinander und mit
automatischen Wiederholungsversuchen geladen, um das Rate-Limit des
CRC-1453-Servers einzuhalten.

## Funktionen

- Volltextsuche über Titel, Autor:innen, DOI, Journal und Datenmerkmale
- Facetten nach Jahr, Datenstatus, Organismus, Material, Methode, Intervention,
  Journal und Publikationsthema
- Sortierung nach Jahr, Titel oder Anzahl der Datensätze
- Detailansicht veröffentlichter und auf Anfrage verfügbarer Datensätze
- Responsive, barrierearme statische Website ohne Backend

## Lokal starten

Da Browser API-Anfragen bei `file://` unterschiedlich behandeln, sollte die
Seite über einen lokalen Webserver geöffnet werden:

```bash
npx serve .
```

## GitHub Pages

Die veröffentlichte Website ist unter
[https://ag-rdm.github.io/publications-crc-1453-mirror/](https://ag-rdm.github.io/publications-crc-1453-mirror/)
erreichbar.

Der Workflow `.github/workflows/static.yml` veröffentlicht die Website
bei jedem Push auf `main`. Im Repository muss unter **Settings → Pages** als
Quelle **GitHub Actions** ausgewählt sein.
