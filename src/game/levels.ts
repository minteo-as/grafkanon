import type { WaveSpec, Weapon } from './waves'

export interface World {
  id: number
  name: string
  weapon: Weapon
}

export const WORLDS: World[] = [
  { id: 1, name: 'Linjebyen', weapon: 'laser' },
  { id: 2, name: 'Parabelbjergene', weapon: 'grenade' },
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
]
