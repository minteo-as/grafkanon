import type { WaveSpec, Weapon } from './waves'

export interface World {
  id: number
  name: string
  weapon: Weapon
}

export const WORLDS: World[] = [
  { id: 1, name: 'Linjebyen', weapon: 'laser' },
  { id: 2, name: 'Parabelbjergene', weapon: 'grenade' },
  { id: 3, name: 'Vækstlaboratoriet', weapon: 'rocket' },
]

export interface Level {
  id: string
  world: number
  name: string
  /** Hvad banen træner, vist i menuen. */
  topic: string
  /** Parametre, der står fast i hele banen, fx a = −1, mens man lærer toppunktet. */
  locked?: { a?: number }
  /** Granaten styres med y = ax² + bx + c i stedet for toppunktsformen. */
  form?: 'vertex' | 'general'
  /** Bossbanen i en verden. Den åbner først, når man har stjerner nok i verdenen. */
  boss?: boolean
  waves: WaveSpec[]
}

export const weaponOf = (level: Level): Weapon => WORLDS.find((w) => w.id === level.world)!.weapon

const WHOLE = [1, 2, 3, -1, -2, -3]
const HALF = [0.5, -0.5, 1.5, -1.5]
const ALL = [...WHOLE, ...HALF, 0]

const DOWN = { dx: 0, dy: -1 }
const RIGHT = { dx: 1, dy: 0 }
const LEFT = { dx: -1, dy: 0 }
const UP = { dx: 0, dy: 1 }

const ARC_AS = [-0.5, -1, -2]

// Vækstlaboratoriet: vækstfaktorer, startværdier og hældninger for lineær vækst
const GROW = [1.5, 1.25, 1.2, 1.1]
const DECAY = [0.5, 0.8, 0.75, 0.9]
const LOW_START = [1, 2, 3, 4]
const HIGH_START = [6, 7, 8, 9, 10, 11]
const LIN = [0.5, 1, 1.5, 2, -0.5, -1]
const LIN_START = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export const LEVELS: Level[] = [
  {
    id: 'linjebyen-1',
    world: 1,
    name: 'Første skud',
    topic: 'Hældning med hele tal',
    waves: [
      {
        groups: [{ count: 3, slopes: [1, 2, -1, -2] }],
        singles: 1,
        spareShots: 1,
        hint: 'Tre glitches står på linje. Kan du ramme dem alle med ét skud?',
      },
      {
        groups: [
          { count: 3, slopes: WHOLE },
          { count: 2, slopes: WHOLE },
        ],
        singles: 0,
        spareShots: 1,
        hint: 'To grupper. Hvilken hældning har hver gruppe?',
      },
      {
        groups: [
          { count: 3, slopes: WHOLE },
          { count: 3, slopes: WHOLE },
        ],
        singles: 1,
        spareShots: 0,
        hint: 'Nu er der præcis nok skud. Hvert skud skal ramme en hel gruppe.',
      },
      {
        groups: [
          { count: 3, slopes: WHOLE },
          { count: 3, slopes: WHOLE },
          { count: 2, slopes: WHOLE },
        ],
        singles: 0,
        spareShots: 0,
        hint: 'Tre grupper. Find alle tre linjer.',
      },
    ],
  },
  {
    id: 'linjebyen-2',
    world: 1,
    name: 'Komma og nul',
    topic: 'Hældning med komma og vandrette linjer',
    waves: [
      {
        groups: [{ count: 3, slopes: HALF }],
        singles: 1,
        spareShots: 1,
        hint: 'y = 0,5x stiger ½ for hver 1 til højre. Altså 1 op for hver 2 til højre.',
      },
      {
        groups: [
          { count: 3, slopes: HALF },
          { count: 3, slopes: WHOLE },
        ],
        singles: 0,
        spareShots: 0,
        hint: 'Én gruppe har en hældning med komma, den anden et helt tal.',
      },
      {
        groups: [
          { count: 3, slopes: [0] },
          { count: 3, slopes: HALF },
        ],
        singles: 0,
        spareShots: 0,
        hint: 'En vandret linje har hældning 0. Så er forskriften bare y = b.',
      },
      {
        groups: [
          { count: 3, slopes: ALL },
          { count: 3, slopes: ALL },
          { count: 3, slopes: ALL },
        ],
        singles: 0,
        spareShots: 0,
        hint: 'Tre grupper med alle slags hældninger.',
      },
    ],
  },
  {
    id: 'linjebyen-3',
    world: 1,
    name: 'Marchørerne',
    topic: 'Parallelforskydning: når b ændrer sig',
    waves: [
      {
        groups: [{ count: 3, slopes: [1, 2, -1, -2], march: DOWN }],
        singles: 1,
        spareShots: 1,
        marchInterval: 3.5,
        hint: 'Marchørerne går ét felt ned ad gangen. Hældningen er den samme, men b bliver 1 mindre.',
      },
      {
        groups: [
          { count: 3, slopes: WHOLE, march: DOWN },
          { count: 3, slopes: WHOLE },
        ],
        singles: 0,
        spareShots: 0,
        marchInterval: 3,
        hint: 'Skyd marchørerne, før de når kanten. De andre står stille.',
      },
      {
        groups: [
          { count: 3, slopes: HALF, march: DOWN },
          { count: 3, slopes: WHOLE, march: DOWN },
        ],
        singles: 0,
        spareShots: 0,
        marchInterval: 3,
        hint: 'To grupper marcherer. Hver gang de går ned, bliver b 1 mindre.',
      },
      {
        groups: [
          { count: 3, slopes: [1, 2, -1, -2], march: RIGHT },
          { count: 3, slopes: HALF },
        ],
        singles: 0,
        spareShots: 0,
        marchInterval: 3.5,
        hint: 'Nu går de til højre. Linjen flytter sig også. Hvor skærer den y-aksen nu?',
      },
    ],
  },
  {
    id: 'linjebyen-barriere',
    world: 1,
    name: 'Barrieren',
    topic: 'Lodrette og vandrette linjer: x = k og y = k',
    waves: [
      {
        groups: [{ count: 3, slopes: [1, 2, -1, -2], march: DOWN }],
        singles: 1,
        spareShots: 1,
        barriers: 2,
        marchInterval: 2.2,
        hint: 'Marchørerne går hurtigt nedad. En vandret barriere y = k under dem stopper dem i 8 sekunder.',
      },
      {
        groups: [
          { count: 3, slopes: WHOLE, march: RIGHT },
          { count: 3, slopes: WHOLE },
        ],
        singles: 0,
        spareShots: 0,
        barriers: 2,
        marchInterval: 2.2,
        hint: 'Nu går de mod højre. Hvilken barriere stopper dem: x = k eller y = k?',
      },
      {
        groups: [
          { count: 3, slopes: WHOLE, march: DOWN },
          { count: 3, slopes: HALF, march: LEFT },
        ],
        singles: 0,
        spareShots: 0,
        barriers: 2,
        marchInterval: 2.4,
        hint: 'To grupper i hver sin retning. Hver gruppe skal have sin egen slags barriere.',
      },
      {
        groups: [
          { count: 3, slopes: ALL, march: UP },
          { count: 3, slopes: ALL, march: RIGHT },
          { count: 2, slopes: WHOLE },
        ],
        singles: 0,
        spareShots: 0,
        barriers: 2,
        marchInterval: 2.2,
        hint: 'Nogle går opad, andre mod højre. Stop dem, og find linjerne i ro og mag.',
      },
    ],
  },
  {
    id: 'linjebyen-skjolde',
    world: 1,
    name: 'Skjolde og spejle',
    topic: 'Fortegnet på a og spejling i y-aksen',
    waves: [
      {
        groups: [{ count: 3, slopes: WHOLE, shield: 'neg' }],
        singles: 1,
        spareShots: 1,
        hint: 'Skjoldbærerne med − kan kun rammes af en linje med negativ hældning (a < 0).',
      },
      {
        groups: [
          { count: 3, slopes: WHOLE, shield: 'pos' },
          { count: 3, slopes: WHOLE, shield: 'neg' },
        ],
        singles: 0,
        spareShots: 0,
        hint: '+ betyder a > 0, og − betyder a < 0. En vandret linje (a = 0) kommer ikke igennem nogen af dem.',
      },
      {
        groups: [{ count: 3, slopes: WHOLE }],
        singles: 0,
        splitters: 2,
        spareShots: 0,
        hint: 'Delere (de blå) bliver til en ny glitch spejlet i y-aksen: (x, y) bliver til (−x, y).',
      },
      {
        groups: [
          { count: 3, slopes: ALL, shield: 'neg' },
          { count: 3, slopes: HALF },
        ],
        singles: 0,
        splitters: 1,
        spareShots: 0,
        hint: 'Skjolde og en deler. Tænk på fortegnet, og gæt, hvor spejlbilledet dukker op.',
      },
    ],
  },
  {
    id: 'linjebyen-4',
    world: 1,
    name: 'Blandet',
    topic: 'Alt fra Linjebyen på én gang',
    waves: [
      {
        groups: [
          { count: 3, slopes: ALL },
          { count: 3, slopes: ALL, march: DOWN },
        ],
        singles: 1,
        spareShots: 0,
        marchInterval: 2.8,
        hint: 'Start med dem, der bevæger sig.',
      },
      {
        groups: [
          { count: 3, slopes: [0], march: DOWN },
          { count: 3, slopes: HALF },
        ],
        singles: 0,
        spareShots: 0,
        marchInterval: 2.8,
        hint: 'En vandret linje, der går nedad. Hvad sker der med b?',
      },
      {
        groups: [
          { count: 3, slopes: WHOLE, march: LEFT },
          { count: 3, slopes: ALL },
        ],
        singles: 0,
        spareShots: 0,
        marchInterval: 3,
        hint: 'Når de går til venstre, flytter linjen sig den anden vej.',
      },
      {
        groups: [
          { count: 3, slopes: ALL, march: DOWN },
          { count: 3, slopes: ALL },
          { count: 3, slopes: ALL },
        ],
        singles: 0,
        spareShots: 0,
        marchInterval: 2.6,
        hint: 'Sidste bølge. Tre grupper, og én af dem marcherer.',
      },
    ],
  },
  {
    id: 'linjebyen-boss',
    world: 1,
    name: 'Tvillingen',
    topic: 'Boss: forskriften ud fra to punkter',
    boss: true,
    waves: [
      {
        groups: [
          { count: 3, slopes: ALL, shield: 'pos' },
          { count: 3, slopes: ALL, march: DOWN },
        ],
        singles: 0,
        splitters: 1,
        spareShots: 0,
        barriers: 1,
        marchInterval: 2.6,
        hint: 'Ryd vejen til Tvillingen.',
      },
      {
        groups: [{ count: 3, slopes: WHOLE }],
        singles: 0,
        spareShots: 1,
        boss: { kind: 'twins', phases: 3, values: [...WHOLE, ...HALF] },
        hint: 'Tvillingen har to svage punkter. De skal rammes med samme skud, så find linjen gennem dem begge.',
      },
    ],
  },
  {
    id: 'parabel-1',
    world: 2,
    name: 'Toppunktet',
    topic: 'Toppunktet (h, k) med a = −1',
    locked: { a: -1 },
    waves: [
      {
        groups: [{ kind: 'arc', count: 2, as: [-1], top: true }],
        singles: 0,
        spareShots: 1,
        hint: 'Buens højeste punkt er toppunktet (h, k). Læg toppunktet på den øverste drone.',
      },
      {
        groups: [{ kind: 'arc', count: 3, as: [-1], top: true }],
        singles: 0,
        spareShots: 1,
        hint: 'Tre droner på samme bue. Find toppunktet, så rammer buen også de andre.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: [-1], top: true },
          { kind: 'arc', count: 2, as: [-1], top: true },
        ],
        singles: 0,
        spareShots: 0,
        walls: 1,
        hint: 'En mur! Granaten stopper, hvis buen er for lav, hvor muren står.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: [-1], top: true },
          { kind: 'arc', count: 3, as: [-1], top: true },
        ],
        singles: 0,
        spareShots: 0,
        walls: 1,
        hint: 'To buer og en mur. Hver bue skal gennem et toppunkt.',
      },
    ],
  },
  {
    id: 'parabel-2',
    world: 2,
    name: 'Smal og bred',
    topic: 'Hvad a gør ved buen',
    waves: [
      {
        groups: [{ kind: 'arc', count: 3, as: [-0.5], top: true }],
        singles: 0,
        spareShots: 1,
        hint: 'Nu kan du ændre a. a = −0,5 giver en bredere bue end a = −1.',
      },
      {
        groups: [{ kind: 'arc', count: 3, as: [-2], top: true }],
        singles: 0,
        spareShots: 1,
        hint: 'a = −2 giver en smal og stejl bue.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS, top: true },
          { kind: 'arc', count: 3, as: ARC_AS, top: true },
        ],
        singles: 0,
        spareShots: 0,
        walls: 1,
        hint: 'To buer med forskellig bredde. Find toppunktet først, og prøv dig så frem med a.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS },
          { kind: 'arc', count: 2, as: ARC_AS },
        ],
        singles: 0,
        spareShots: 0,
        walls: 1,
        hint: 'Ingen drone i toppunktet. Buen er symmetrisk: to droner i samme højde har toppunktet midt imellem sig.',
      },
    ],
  },
  {
    id: 'parabel-3',
    world: 2,
    name: 'Nulpunkterne',
    topic: 'Hvor buen rammer jorden',
    waves: [
      {
        groups: [{ kind: 'arc', count: 2, as: [-1], ground: true }],
        singles: 0,
        spareShots: 1,
        hint: 'Kanonen står i venstre nulpunkt, og granaten lander i højre. Ram glitchen på jorden.',
      },
      {
        groups: [{ kind: 'arc', count: 3, as: [-1, -0.5], ground: true }],
        singles: 0,
        spareShots: 1,
        hint: 'Nulpunkterne ligger lige langt fra toppunktet til hver side.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS, ground: true },
          { kind: 'arc', count: 3, as: ARC_AS, top: true },
        ],
        singles: 0,
        spareShots: 0,
        walls: 1,
        hint: 'Én bue skal lande på glitchen, den anden skal gennem et toppunkt.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS, ground: true },
          { kind: 'arc', count: 3, as: ARC_AS },
        ],
        singles: 1,
        spareShots: 0,
        walls: 2,
        hint: 'Sidste bølge i Parabelbjergene. To mure, to buer og en drone for sig selv.',
      },
    ],
  },
  {
    id: 'parabel-abc',
    world: 2,
    name: 'Almindelig form',
    topic: 'y = ax² + bx + c',
    form: 'general',
    waves: [
      {
        groups: [{ kind: 'arc', count: 3, as: [-1], yAxis: true }],
        singles: 0,
        spareShots: 1,
        hint: 'Her styrer du y = ax² + bx + c. Buen skærer y-aksen i y = c, så ram dronen på y-aksen først.',
      },
      {
        groups: [{ kind: 'arc', count: 3, as: [-1, -0.5], top: true }],
        singles: 0,
        spareShots: 1,
        hint: 'Toppunktets x-værdi er −b/(2a). Med a = −1 er toppunktet altså i x = b/2.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS, yAxis: true },
          { kind: 'arc', count: 2, as: ARC_AS, top: true },
        ],
        singles: 0,
        spareShots: 0,
        walls: 1,
        hint: 'Brug c til dronen på y-aksen og −b/(2a) til toppunktet.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS },
          { kind: 'arc', count: 3, as: ARC_AS, yAxis: true },
        ],
        singles: 0,
        spareShots: 0,
        walls: 1,
        hint: 'Du kan også skrive forskriften i toppunktsform. Spillet regner den selv om.',
      },
    ],
  },
  {
    id: 'parabel-blandet',
    world: 2,
    name: 'Blandet',
    topic: 'Alt fra Parabelbjergene på én gang',
    waves: [
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS, ground: true },
          { kind: 'arc', count: 3, as: ARC_AS, top: true },
        ],
        singles: 0,
        spareShots: 0,
        walls: 2,
        hint: 'Én bue lander på glitchen, den anden går gennem et toppunkt.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: [-0.25, -0.5] },
          { kind: 'arc', count: 3, as: [-1, -2] },
        ],
        singles: 1,
        spareShots: 0,
        walls: 1,
        hint: 'En bred og en smal bue. Brug symmetrien til at finde toppunkterne.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS, yAxis: true },
          { kind: 'arc', count: 3, as: ARC_AS, ground: true },
        ],
        singles: 0,
        spareShots: 0,
        walls: 2,
        hint: 'Skæring med y-aksen og nulpunkt: to buer, to mure.',
      },
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS },
          { kind: 'arc', count: 3, as: ARC_AS },
          { kind: 'arc', count: 2, as: ARC_AS, top: true },
        ],
        singles: 0,
        spareShots: 0,
        walls: 2,
        hint: 'Tre buer og ingen ekstra skud.',
      },
    ],
  },
  {
    id: 'parabel-boss',
    world: 2,
    name: 'Kurven',
    topic: 'Boss: find parablen ud fra dens graf',
    boss: true,
    waves: [
      {
        groups: [
          { kind: 'arc', count: 3, as: ARC_AS, ground: true },
          { kind: 'arc', count: 3, as: ARC_AS },
        ],
        singles: 1,
        spareShots: 0,
        walls: 1,
        hint: 'Ryd vejen til Kurven.',
      },
      {
        groups: [],
        singles: 0,
        spareShots: 1,
        walls: 1,
        boss: { kind: 'curve', phases: 3, values: [-0.5, -1, -2] },
        hint: 'Kurven flyver langs sin egen parabel. Skyd præcis langs dens bane, så rammer du det svage punkt i toppunktet.',
      },
    ],
  },
  {
    id: 'vaekst-1',
    world: 3,
    name: 'Fordobling',
    topic: 'y = b · aˣ: startværdi og fremskrivning',
    waves: [
      {
        groups: [{ kind: 'growth', count: 3, as: [2], bs: [1, 2], start: true }],
        singles: 0,
        spareShots: 1,
        hint: 'Raketten starter på y-aksen i y = b og bliver a gange højere for hvert skridt. Dronen på y-aksen viser b.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: [2], bs: [1, 2], start: true },
          { kind: 'growth', count: 3, as: [2], bs: [0.25, 0.5] },
        ],
        singles: 0,
        spareShots: 1,
        hint: 'Den anden kurve har ingen drone på y-aksen. Gå baglæns ved at halvere, til du når x = 0. Så har du b.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: [2, 3], bs: [0.25, 0.5, 1] },
          { kind: 'growth', count: 2, as: [2, 3], bs: [0.25, 0.5, 1, 2] },
        ],
        singles: 1,
        spareShots: 1,
        hint: 'Gå baglæns til x = 0: når a = 2, halverer du for hvert skridt. Når a = 3, dividerer du med 3.',
      },
    ],
  },
  {
    id: 'vaekst-2',
    world: 3,
    name: 'Procent',
    topic: 'Vækst i procent: a = 1 + p/100',
    waves: [
      {
        groups: [{ kind: 'growth', count: 3, as: [1.5, 1.25], bs: [2, 3, 4], start: true }],
        singles: 0,
        spareShots: 1,
        hint: '+50 % pr. skridt betyder, at y ganges med 1,5. Så er a = 1,5.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: [1.2, 1.1, 1.25], bs: LOW_START },
          { kind: 'growth', count: 2, as: [1.5], bs: [1, 2] },
        ],
        singles: 0,
        spareShots: 1,
        hint: 'Små procenter vokser langsomt i starten og hurtigt til sidst. Find faktoren ved at dividere en y-værdi med den forrige.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: GROW, bs: LOW_START },
          { kind: 'growth', count: 3, as: GROW, bs: LOW_START },
        ],
        singles: 1,
        spareShots: 1,
        hint: 'Hvor mange procent vokser hver kurve med? a = 1,1 betyder +10 % pr. skridt.',
      },
    ],
  },
  {
    id: 'vaekst-3',
    world: 3,
    name: 'Henfald',
    topic: 'Fald i procent: a = 1 − p/100',
    waves: [
      {
        groups: [{ kind: 'growth', count: 3, as: [0.5], bs: [8, 10], start: true }],
        singles: 0,
        spareShots: 1,
        hint: 'Når a er mindre end 1, bliver y mindre for hvert skridt. a = 0,5 betyder, at y halveres.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: [0.8, 0.75], bs: HIGH_START, start: true },
          { kind: 'growth', count: 2, as: [0.5], bs: [6, 8, 10] },
        ],
        singles: 0,
        spareShots: 1,
        hint: '−20 % pr. skridt betyder, at y ganges med 0,8. Så er a = 0,8.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: DECAY, bs: HIGH_START },
          { kind: 'growth', count: 3, as: DECAY, bs: HIGH_START },
        ],
        singles: 1,
        spareShots: 1,
        hint: 'Gå et skridt tilbage ved at dividere med a. Så finder du startværdien b.',
      },
    ],
  },
  {
    id: 'vaekst-4',
    world: 3,
    name: 'Lineær eller eksponentiel',
    topic: 'Samme tal eller samme procent hvert skridt',
    waves: [
      {
        groups: [
          { kind: 'growth', count: 3, as: [1, 2], bs: [1, 2, 3], linear: true, start: true },
          { kind: 'growth', count: 3, as: [2], bs: [1, 2, 3], start: true },
        ],
        singles: 0,
        spareShots: 1,
        linear: true,
        hint: 'Nogle droner vokser med det samme tal hvert skridt (lineært), andre med den samme faktor (eksponentielt). Tryk L for at skifte.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: LIN, bs: LIN_START, linear: true },
          { kind: 'growth', count: 3, as: [1.5, 2, 0.5, 0.75], bs: [2, 3, 4, 6, 8, 10] },
        ],
        singles: 0,
        spareShots: 1,
        linear: true,
        hint: 'Se på forskellene: ens forskelle betyder lineær vækst. Ens forhold betyder eksponentiel vækst.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: LIN, bs: LIN_START, linear: true },
          { kind: 'growth', count: 3, as: GROW, bs: LOW_START },
          { kind: 'growth', count: 2, as: LIN, bs: LIN_START, linear: true },
        ],
        singles: 0,
        spareShots: 1,
        linear: true,
        hint: 'Tre kurver. Er de lineære eller eksponentielle?',
      },
    ],
  },
  {
    id: 'vaekst-blandet',
    world: 3,
    name: 'Blandet',
    topic: 'Alt fra Vækstlaboratoriet på én gang',
    waves: [
      {
        groups: [
          { kind: 'growth', count: 3, as: GROW, bs: LOW_START },
          { kind: 'growth', count: 3, as: DECAY, bs: HIGH_START },
        ],
        singles: 1,
        spareShots: 1,
        linear: true,
        hint: 'Én kurve vokser, og én falder.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: LIN, bs: LIN_START, linear: true },
          { kind: 'growth', count: 3, as: [2, 3, 1.5], bs: [1, 2, 3] },
        ],
        singles: 1,
        spareShots: 1,
        linear: true,
        hint: 'Lineær eller eksponentiel? Se på forskellene og forholdene.',
      },
      {
        groups: [
          { kind: 'growth', count: 3, as: GROW, bs: LOW_START },
          { kind: 'growth', count: 3, as: DECAY, bs: HIGH_START },
          { kind: 'growth', count: 3, as: LIN, bs: LIN_START, linear: true },
        ],
        singles: 0,
        spareShots: 1,
        linear: true,
        hint: 'Tre kurver. Tag dem én ad gangen.',
      },
    ],
  },
  {
    id: 'vaekst-boss',
    world: 3,
    name: 'Kolonien',
    topic: 'Boss: find vækstkurven ud fra to punkter',
    boss: true,
    waves: [
      {
        groups: [
          { kind: 'growth', count: 3, as: [2, 1.5], bs: [1, 2, 3] },
          { kind: 'growth', count: 3, as: [0.5, 0.8], bs: HIGH_START },
        ],
        singles: 1,
        spareShots: 0,
        linear: true,
        hint: 'Ryd vejen til Kolonien.',
      },
      {
        groups: [],
        singles: 0,
        spareShots: 1,
        boss: { kind: 'colony', phases: 3, values: [2, 1.5, 0.5, 3] },
        hint: 'Kolonien vokser. Dens to svage punkter står ét skridt fra hinanden på samme vækstkurve og skal rammes med samme raket. Faktoren er a = y₂ : y₁.',
      },
    ],
  },
]
