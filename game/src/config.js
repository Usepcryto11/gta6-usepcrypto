// Solmar City — tuning numbers, palette and save key in one place.
// The world is a fixed 3200x2400 open city; the camera follows the player and the
// renderer scales to the window, so no rule below depends on the screen size.

export const WORLD = { width: 3200, height: 2400 };
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 700,
  maxSpeed: 560,
  reverseMax: 180,
  turn: 2.6,
  drag: 0.6,
};

export const WANTED_MAX = 5;
export const SAVE_KEY = 'solmar-city.save.v1';
export const BEST_KEY = 'solmar-city.best-cash';

export const PALETTE = {
  grass: '#7fae5a',
  park: '#6da34e',
  sand: '#e8d39a',
  water: '#3f8fc4',
  road: '#3d3d46',
  roadLine: '#e8d44d',
  sidewalk: '#9aa0a8',
  building: ['#c96f4a', '#d9a441', '#5b7fa6', '#8a6fa8', '#4a9e7a', '#b0526b', '#7a8a99', '#c47f3f'],
  buildingRoof: ['#a85438', '#b8892f', '#47688c', '#715a8f', '#3c8264', '#93425a'],
  player: '#f2c94c',
  playerCar: '#e5534b',
  police: '#2f6fd0',
  traffic: ['#d8d8d8', '#3f6fb5', '#c23b3b', '#3f9e5f', '#e0a53a', '#7a5fb5', '#2f2f38'],
  ped: ['#e8b48a', '#c98a6a', '#8a5a3b', '#f0d0b0'],
  text: '#f4f1e8',
  muted: '#b9b3a4',
  panel: 'rgba(12, 14, 22, 0.78)',
  star: '#ffd23f',
  mission: '#ffd23f',
  health: '#58c96b',
  damage: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Story missions. Each has an id, title, briefing lines, a target point and a
// reward. The world drives the objective from these.
export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 150,
    brief: ['Rico: Mara, welcome to Solmar City.', 'Get to the docks and meet my crew. A car is waiting.'],
    target: { x: 2850, y: 2050 },
    targetName: 'Solmar Docks',
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    reward: 300,
    brief: ['Rico: That red sports car by the marina is ours tonight.', 'Take it and bring it to the garage in Old Town.'],
    target: { x: 1290, y: 350 },
    targetName: 'Marina sports car',
    steal: true,
  },
  {
    id: 'heat',
    title: 'Heat',
    reward: 400,
    brief: ['Rico: The cops saw the plates. Lose them.', 'Get your wanted level down to zero, then come back.'],
    target: { x: 450, y: 2050 },
    targetName: 'Hideout',
    wanted: 3,
  },
  {
    id: 'the-drop',
    title: 'The Drop',
    reward: 500,
    brief: ['Rico: A package for the Old Town crew. No stops, no cops.', 'Deliver it before the timer runs out.'],
    target: { x: 750, y: 750 },
    targetName: 'Old Town drop',
    timeLimit: 75,
  },
  {
    id: 'solmar-job',
    title: 'The Solmar Job',
    reward: 1200,
    brief: ['Rico: Last one. The bank on Harbor Row, then the hideout.', 'Grab the cash and do not get caught.'],
    target: { x: 2350, y: 250 },
    targetName: 'Harbor Row bank',
    wanted: 4,
  },
];

export const DISTRICTS = [
  { name: 'Old Town', x: 0, y: 0, w: 1000, h: 1000 },
  { name: 'Harbor Row', x: 2000, y: 0, w: 1200, h: 1000 },
  { name: 'Marina', x: 1000, y: 0, w: 1000, h: 1000 },
  { name: 'Downtown', x: 1000, y: 1000, w: 1000, h: 1000 },
  { name: 'Westside', x: 0, y: 1000, w: 1000, h: 1400 },
  { name: 'Solmar Docks', x: 2000, y: 1000, w: 1200, h: 1400 },
];
