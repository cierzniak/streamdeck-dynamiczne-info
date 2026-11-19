# dynamiczne.info dla Stream Decka

Plugin Stream Deck pokazujący godzinową cenę prądu brutto z [dynamiczne.info](https://dynamiczne.info)
dla Twojego operatora i taryfy. Dwie akcje:

- **Cena teraz** — cena w bieżącej godzinie,
- **Cena za godzinę** — cena w następnej godzinie, podpisana godziną rozpoczęcia.

Tło kafelka mówi to samo, co podpowiedzi na stronie:

| Kolor | Znaczenie |
|---|---|
| zielony | korzystaj — tanio |
| ciemny | neutralnie |
| pomarańczowy | ogranicz — drogo |
| szary | brak ceny: kafelek nieskonfigurowany, dane jeszcze nieopublikowane albo błąd połączenia |

## Wymagania

- Stream Deck 7.1 lub nowszy,
- macOS 12+ albo Windows 10+ (plugin jest testowany tylko na macOS).

## Instalacja

1. Pobierz `info.dynamiczne.prices.streamDeckPlugin` z [najnowszego wydania](https://github.com/cierzniak/streamdeck-dynamiczne-info/releases/latest).
2. Otwórz pobrany plik — Stream Deck zainstaluje plugin.
3. Przeciągnij akcję „Cena teraz” lub „Cena za godzinę” na kafelek.
4. W ustawieniach kafelka wybierz operatora i taryfę. Kolejne kafelki dostaną ten sam wybór domyślnie.

Naciśnięcie kafelka otwiera dynamiczne.info i odświeża dane.

## Jak to działa

Plugin co 30 minut pobiera publiczne API serwisu (`/api/v1/outlook/{operator}/{taryfa}`) i o każdej pełnej
godzinie przełącza kafelki na kolejną godzinę. Jeśli połączenie zniknie, kafelek pokazuje cenę z ostatnich
pobranych danych, dopóki obejmują one daną godzinę. Cena „za godzinę” tuż przed północą jest dostępna dopiero
po publikacji jutrzejszego fixingu — do tego czasu kafelek pokazuje „—”.

Plugin nie zbiera żadnych danych i nie wymaga konta. Mieści się w limicie API bez klucza (10 zapytań na minutę
z jednego adresu IP). Jeśli z tego samego adresu korzysta z API więcej urządzeń, wpisz w ustawieniach kafelka
[bezpłatny klucz](https://dynamiczne.info/api/token) — jest wspólny dla wszystkich kafelków.

## Rozwój

Wszystko działa w kontenerze, Node na hoście nie jest potrzebny:

```bash
make install    # zależności
make all        # lint + testy + build + walidacja manifestu
make pack       # dist/info.dynamiczne.prices.streamDeckPlugin
make icons      # PNG z assets/icons/*.svg (wymaga ImageMagick na hoście)
```

Logika jest w czystych modułach (`src/hours.ts`, `src/tile.ts`, `src/tile-state.ts`) i ma testy;
`src/actions/` tylko łączy ją z SDK Stream Decka.

### Test ręczny przed wydaniem

1. Oba kafelki pokazują cenę zgodną ze stroną dla wybranej taryfy.
2. Zmiana operatora przeładowuje listę taryf.
3. Drugi kafelek dziedziczy taryfę pierwszego.
4. Po wyłączeniu sieci kafelek dalej pokazuje cenę.
5. O pełnej godzinie kafelki przechodzą na kolejną godzinę.

### Wydanie

1. Podbij `Version` w `info.dynamiczne.prices.sdPlugin/manifest.json` (cztery człony, np. `0.2.0.0`) i `version` w `package.json`.
2. `git tag -a v0.2.0 --cleanup=verbatim` z notatkami wydania w treści taga.
3. `git push origin main v0.2.0` — workflow `Release` zbuduje plik i opublikuje wydanie.

## Licencja

MIT
