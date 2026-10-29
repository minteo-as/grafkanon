# Grafkanonen

Et 3D-skydespil i browseren til matematik i 9. klasse. Man sigter med en funktion, og laserstrålen følger grafen hen over et koordinatsystem.

Spildesignet ligger i [design/grafkanonen.html](design/grafkanonen.html).

## Kom i gang

```bash
npm install
npm run dev
```

Åbn derefter http://localhost:5173.

| Kommando            | Hvad den gør                                 |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Starter udviklingsserveren                   |
| `npm test`          | Kører testene af matematik, bølger og point  |
| `npm run typecheck` | Tjekker TypeScript                           |
| `npm run build`     | Bygger en statisk udgave i `dist/`           |

## Opbygning

- `src/math/` læser, formaterer og klipper lineære funktioner (dansk decimalkomma).
- `src/game/` indeholder spillets regler uden grafik: baner, bølger, marchører, skud, point, stjerner og gemt fremskridt.
- `src/audio/` laver lydeffekterne med Web Audio, så der ikke er lydfiler.
- `src/render/` er Three.js-scenen: banen, kanonen, strålen og glitches.
- `src/ui/` styrer startmenu, HUD, skydere, tekstfelt og tastatur.
- `src/main.ts` binder det hele sammen og kører spilløkken.

## Baner

Banerne er defineret i `src/game/levels.ts`. Hver bane er en liste af bølger, og hver bølge beskriver grupper af glitches (antal, mulige hældninger og om de marcherer), enkelte glitches, ekstra skud og et tip. Bølgerne laves tilfældigt ud fra beskrivelsen, så de er forskellige hver gang.

Stjerner: ★ for at klare banen, ★★ uden ekstra skud, ★★★ også uden sigtelinje og koordinater.
