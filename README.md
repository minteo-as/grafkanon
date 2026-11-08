# Grafkanonen

Et 3D-skydespil i browseren til matematik i 9. klasse. Man sigter med en funktion, og laserstrålen følger grafen hen over et koordinatsystem.

Spildesignet ligger i [design/grafkanonen.html](design/grafkanonen.html).

## Kom i gang

```bash
npm install
npm run dev
```

Åbn derefter http://localhost:5173.

| Kommando            | Hvad den gør                                |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Starter udviklingsserveren                  |
| `npm test`          | Kører testene af matematik, bølger og point |
| `npm run typecheck` | Tjekker TypeScript                          |
| `npm run build`     | Bygger en statisk udgave i `dist/`          |
| `npm run format`    | Formaterer koden med Prettier               |

## Opbygning

- `src/math/` læser og formaterer forskrifter (dansk decimalkomma) og beregner våbnenes baner: laserens linje og granatens parabel med nulpunkter og mure.
- `src/game/` indeholder spillets regler uden grafik: baner, bølger, marchører, skud, point, stjerner og gemt fremskridt.
- `src/audio/` laver lydeffekterne med Web Audio, så der ikke er lydfiler.
- `src/render/` er Three.js-scenen: gulvet i Linjebyen, sidebilledet i Parabelbjergene, kanonen, laser, granat, mure og glitches.
- `src/ui/` styrer startmenu, HUD, skydere, tekstfelt og tastatur.
- `src/main.ts` binder det hele sammen og kører spilløkken.
- `scripts/release-version.ts` tjekker versionsnumre ved release (bruges af release-workflowen).

## Baner

Banerne er defineret i `src/game/levels.ts` og hører til en verden med sit eget våben:

- **Verden 1 · Linjebyen** (laser, `y = ax + b`): glitches på et gulv, set ovenfra. 6 baner og bossen **Tvillingen**, hvis to svage punkter skal rammes med samme skud. Undervejs kommer marchører, **barrierer** (`x = k` eller `y = k`, der stopper marchører i 8 sekunder), **skjoldbærere** (kan kun rammes, når a har det rigtige fortegn) og **delere** (dukker op igen spejlet i y-aksen).
- **Verden 2 · Parabelbjergene** (granatkaster, `y = a(x − h)² + k`): droner i et lodret sidebillede. Granaten flyver fra venstre nulpunkt til højre og stopper ved mure, den ikke kommer over. 5 baner, heraf én i almindelig form `y = ax² + bx + c`, og bossen **Kurven**, der besejres ved at skyde langs dens egen parabel.
- **Verden 3 · Vækstlaboratoriet** (raket, `y = b · aˣ`): droner i et sidebillede, hvor x er tiden fra 0 til 20. Raketten starter på y-aksen i startværdien b og vokser med faktoren a for hvert skridt, til den forlader billedet. Panelet viser væksten i procent pr. skridt. 5 baner: fordobling, procentvis vækst, henfald, lineær mod eksponentiel vækst (man kan skifte til `y = ax + b` med L) og en blandet bane. Bossen **Kolonien** har to svage punkter ét skridt fra hinanden, så a = y₂ : y₁.

En boss åbner først, når verdenens andre baner er klaret med i gennemsnit 1,5 stjerne.

Hver bane er en liste af bølger, og hver bølge beskriver grupper af mål (antal, mulige hældninger eller værdier af a, om de marcherer, om en drone sidder i toppunktet eller en glitch står i nulpunktet), enkelte mål, mure, ekstra skud og et tip. Bølgerne laves tilfældigt ud fra beskrivelsen, så de er forskellige hver gang, men generatoren tjekker altid, at bølgen kan klares med de skud, man får.

Stjerner: ★ for at klare banen, ★★ uden ekstra skud, ★★★ også uden sigtelinje og koordinater.

### Ugens udfordring

Øverst i menuen ligger ugens udfordring (`src/game/challenge.ts`). Den skifter hver mandag og går på skift mellem verdenerne. Der vælges fire af verdenens almindelige baner og én bølge fra hver. Bølgerne laves med et seed ud fra ISO-ugenummeret, så alle elever får præcis de samme bølger hele ugen, også hvis de prøver en bølge igen. Den er altid åben, og der er ingen server: hver elev ser sin egen bedste score, og klassen sammenligner selv.

## CI

`.github/workflows/ci.yml` kører ved hvert push til `main` og ved hver pull request. Den:

- installerer, tjekker formateringen (Prettier), typetjekker og kører tests,
- bygger og gemmer `dist/` som en zip (under _Artifacts_ på workflow-kørslen, gemmes i 30 dage).

Zip-filen indeholder `index.html`, `.htaccess` og `assets/` direkte i roden og kan pakkes ud på webserveren, som den er.

## Webserver og cache

`public/.htaccess` kommer automatisk med i `dist/`. Den sætter cache-regler på Apache (fx Simply.com):

- `index.html` sendes med `Cache-Control: no-cache`, så browseren altid tjekker, om der er en ny version.
- Filerne i `assets/` har et hash i navnet og må caches i et år (`immutable`).

Uden reglerne kan en browser genbruge en gammel `index.html` efter et deploy. Den peger så på JavaScript-filer, der ikke længere findes, og eleven ser en tom side.

Kræver at serveren tillader `.htaccess` med `Header` (`AllowOverride FileInfo` og `mod_headers`).

## Versioner og releases

`package.json` indeholder altid **seneste udgivne version**. Workflowen retter den selv efter hver release, så den skal ikke rettes i hånden. Den starter på `0.0.0`, så den første release er `v0.1.0` (eller `v0.0.1`/`v1.0.0`).

Versionsnummeret vises nederst i menuen:

- En **release** viser sit tag, fx `Version 0.2.0`.
- **Andre builds** (lokalt og i CI) viser seneste versions-tag plus commit-id, fx `Version 0.2.0+c344353`. Så kan man se, hvad der faktisk ligger på serveren.

Releases laves **kun på GitHub**:

1. _Releases → Draft a new release_.
2. Skriv et nyt tag, fx `v0.2.0`, og vælg `main` som _target_.
3. Tryk evt. _Generate release notes_ og derefter _Publish release_.

Det starter `.github/workflows/release.yml`. Først tjekker den:

- at versionen følger lige efter seneste udgivne release (eller `package.json`, hvis der ikke er nogen endnu). Fra `0.1.0` er kun `v0.1.1`, `v0.2.0` og `v1.0.0` tilladt,
- at tagget peger på en commit på `main`, og at det ikke er en pre-release.

Derefter:

- kører den de samme tjek som CI og bygger med tagget som version,
- lægger den `grafkanonen-vX.Y.Z.zip` på releasen,
- committer den den nye version i `package.json` til `main`.

Fejler noget, før zip-filen er lagt op, sættes releasen tilbage til **kladde** (draft), og fejlen står i workflow-kørslen. Ret fejlen, og udgiv kladden igen (eventuelt med et andet tag).

Zip-filen pakkes ud direkte på webserveren.

Tags, der pushes fra kommandolinjen, laver ikke en release.

Tommelfingerregel for versionsnumre:

| Del       | Hvornår                                                        |
| --------- | -------------------------------------------------------------- |
| **patch** | rettelser                                                      |
| **minor** | nye baner, verdener eller våben                                |
| **major** | ændringer, der fx gør gemte stjerner ugyldige (nye bane-id'er) |
