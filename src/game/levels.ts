import type { WaveSpec } from './waves';

export interface Level {
  id: string;
  name: string;
  /** Hvad banen træner, vist i menuen. */
  topic: string;
  waves: WaveSpec[];
}

const WHOLE = [1, 2, 3, -1, -2, -3];
const HALF = [0.5, -0.5, 1.5, -1.5];
const ALL = [...WHOLE, ...HALF, 0];

const DOWN = { dx: 0, dy: -1 };
const RIGHT = { dx: 1, dy: 0 };
const LEFT = { dx: -1, dy: 0 };

export const LEVELS: Level[] = [
  {
    id: 'linjebyen-1',
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
        groups: [{ count: 3, slopes: WHOLE }, { count: 2, slopes: WHOLE }],
        singles: 0,
        spareShots: 1,
        hint: 'To grupper. Hvilken hældning har hver gruppe?',
      },
      {
        groups: [{ count: 3, slopes: WHOLE }, { count: 3, slopes: WHOLE }],
        singles: 1,
        spareShots: 0,
        hint: 'Nu er der præcis nok skud. Hvert skud skal ramme en hel gruppe.',
      },
      {
        groups: [{ count: 3, slopes: WHOLE }, { count: 3, slopes: WHOLE }, { count: 2, slopes: WHOLE }],
        singles: 0,
        spareShots: 0,
        hint: 'Tre grupper. Find alle tre linjer.',
      },
    ],
  },
  {
    id: 'linjebyen-2',
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
        groups: [{ count: 3, slopes: HALF }, { count: 3, slopes: WHOLE }],
        singles: 0,
        spareShots: 0,
        hint: 'Én gruppe har en hældning med komma, den anden et helt tal.',
      },
      {
        groups: [{ count: 3, slopes: [0] }, { count: 3, slopes: HALF }],
        singles: 0,
        spareShots: 0,
        hint: 'En vandret linje har hældning 0. Så er forskriften bare y = b.',
      },
      {
        groups: [{ count: 3, slopes: ALL }, { count: 3, slopes: ALL }, { count: 3, slopes: ALL }],
        singles: 0,
        spareShots: 0,
        hint: 'Tre grupper med alle slags hældninger.',
      },
    ],
  },
  {
    id: 'linjebyen-3',
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
        groups: [{ count: 3, slopes: WHOLE, march: DOWN }, { count: 3, slopes: WHOLE }],
        singles: 0,
        spareShots: 0,
        marchInterval: 3,
        hint: 'Skyd marchørerne, før de når kanten. De andre står stille.',
      },
      {
        groups: [{ count: 3, slopes: HALF, march: DOWN }, { count: 3, slopes: WHOLE, march: DOWN }],
        singles: 0,
        spareShots: 0,
        marchInterval: 3,
        hint: 'To grupper marcherer. Hver gang de går ned, bliver b 1 mindre.',
      },
      {
        groups: [{ count: 3, slopes: [1, 2, -1, -2], march: RIGHT }, { count: 3, slopes: HALF }],
        singles: 0,
        spareShots: 0,
        marchInterval: 3.5,
        hint: 'Nu går de til højre. Linjen flytter sig også. Hvor skærer den y-aksen nu?',
      },
    ],
  },
  {
    id: 'linjebyen-4',
    name: 'Blandet',
    topic: 'Alt fra Linjebyen på én gang',
    waves: [
      {
        groups: [{ count: 3, slopes: ALL }, { count: 3, slopes: ALL, march: DOWN }],
        singles: 1,
        spareShots: 0,
        marchInterval: 2.8,
        hint: 'Start med dem, der bevæger sig.',
      },
      {
        groups: [{ count: 3, slopes: [0], march: DOWN }, { count: 3, slopes: HALF }],
        singles: 0,
        spareShots: 0,
        marchInterval: 2.8,
        hint: 'En vandret linje, der går nedad. Hvad sker der med b?',
      },
      {
        groups: [{ count: 3, slopes: WHOLE, march: LEFT }, { count: 3, slopes: ALL }],
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
];
