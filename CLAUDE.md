# CLAUDE.md

Plugin Stream Deck pokazujący godzinową cenę prądu z `dynamiczne.info`.
Projekt: `docs/superpowers/specs/2026-10-06-streamdeck-plugin-design.md` (lokalnie, poza gitem).

## Uruchamianie

Host nie ma Node'a. Wszystko przez kontener:

    docker compose run --rm -T node npm install
    docker compose run --rm -T node npm run lint
    docker compose run --rm -T node npm test
    docker compose run --rm -T node npm run build
    docker compose run --rm -T node npm run validate
    docker compose run --rm -T node npm run pack

`make <cel>` owija to samo dla człowieka. Ikony PNG: `sh scripts/icons.sh` (ImageMagick z hosta).

## Zasady

- `src/hours.ts`, `src/tile.ts`, `src/tile-state.ts` są czyste: bez sieci, bez zegara, bez SDK.
  Logika trafia tam i ma test; `src/actions/` tylko skleja.
- Doba ma 23, 24 albo 25 godzin. Godzinę wybieramy po chwili czasu (`startsAt`), nigdy po numerze.
- API serwisu to kontrakt publiczny v1 — plugin czyta, nie wymaga zmian po stronie serwera.
- Teksty interfejsu po polsku. Commity: Conventional Commits po angielsku, bez body, bez stopek.
- Wersja w `manifest.json` ma cztery człony (`0.1.0.0`), tag trzy (`v0.1.0`).
- Release: annotowany tag `git tag -a v0.1.0 --cleanup=verbatim`, push taga buduje i publikuje plik.
- `ui/sdpi-components.js` to zacommitowana kopia biblioteki Elgato (v4) — nie ładujemy jej z CDN.
