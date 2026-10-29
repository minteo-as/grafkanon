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
- `src/game/` indeholder spillets regler uden grafik: bølger, skud, point og hjælp.
- `src/render/` er Three.js-scenen: banen, kanonen, strålen og glitches.
- `src/ui/` styrer HUD, skydere, tekstfelt og tastatur.
- `src/main.ts` binder det hele sammen og kører spilløkken.
