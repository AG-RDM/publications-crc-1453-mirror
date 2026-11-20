# FREDATO Publications TR-359

Eine alternative, filterbare Darstellung der öffentlichen Publikationsliste
[`tr-359`](https://fredato.imbi.uni-freiburg.de/public/publications/tr-359).

Die Website speichert keine Kopie der Publikationsdaten. Beim Aufruf lädt sie
alle Seiten der öffentlichen FREDATO-API direkt im Browser und zeigt daher den
jeweils aktuellen Stand.

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

Der Workflow `.github/workflows/static.yml` veröffentlicht die Website
bei jedem Push auf `main`. Im Repository muss unter **Settings → Pages** als
Quelle **GitHub Actions** ausgewählt sein.
