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

- `src/math/` læser og formaterer forskrifter (dansk decimalkomma) og beregner våbnenes baner: laserens linje og granatens parabel med nulpunkter og mure.
- `src/game/` indeholder spillets regler uden grafik: baner, bølger, marchører, skud, point, stjerner og gemt fremskridt.
- `src/audio/` laver lydeffekterne med Web Audio, så der ikke er lydfiler.
- `src/render/` er Three.js-scenen: gulvet i Linjebyen, sidebilledet i Parabelbjergene, kanonen, laser, granat, mure og glitches.
- `src/ui/` styrer startmenu, HUD, skydere, tekstfelt og tastatur.
- `src/main.ts` binder det hele sammen og kører spilløkken.

## Baner

Banerne er defineret i `src/game/levels.ts` og hører til en verden med sit eget våben:

- **Verden 1 · Linjebyen** (laser, `y = ax + b`): glitches på et gulv, set ovenfra.
- **Verden 2 · Parabelbjergene** (granatkaster, `y = a(x − h)² + k`): droner i et lodret sidebillede. Granaten flyver fra venstre nulpunkt til højre og stopper ved mure, den ikke kommer over.

Hver bane er en liste af bølger, og hver bølge beskriver grupper af mål (antal, mulige hældninger eller værdier af a, om de marcherer, om en drone sidder i toppunktet eller en glitch står i nulpunktet), enkelte mål, mure, ekstra skud og et tip. Bølgerne laves tilfældigt ud fra beskrivelsen, så de er forskellige hver gang, men generatoren tjekker altid, at bølgen kan klares med de skud, man får.

Stjerner: ★ for at klare banen, ★★ uden ekstra skud, ★★★ også uden sigtelinje og koordinater.
