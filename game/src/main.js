// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, busted and story complete.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_MISSION, EVENT_OVER, EVENT_PICKUP, EVENT_SHOT, EVENT_STEAL } from './world.js';
import { ACTION_ATTACK, ACTION_CONFIRM, ACTION_ENTER, ACTION_LOAD, ACTION_MUTE, ACTION_PAUSE, ACTION_SAVE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readNumber(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readNumber(BEST_KEY);
  let hasSave = false;
  try {
    hasSave = window.localStorage.getItem(SAVE_KEY) !== null;
  } catch { hasSave = false; }
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Solmar City.');
  }

  function loadGame() {
    if (world.load()) {
      accumulator = 0;
      screen = SCREEN_PLAY;
      announce('Save loaded. Playing.');
    } else {
      announce('No save found.');
    }
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.busted();
    if (world.state.cash > best) {
      best = world.state.cash;
      saveNumber(BEST_KEY, best);
    }
    announce(`Busted. Cash $${world.state.cash}. Best $${best}.`);
  }

  function doSave() {
    if (world.save()) announce('Progress saved.');
    else announce('Save did not work in this browser.');
  }

  function handleEvents(events) {
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_MISSION) {
      audio.mission();
      world.save();
      if (world.state.storyDone) {
        screen = SCREEN_WIN;
        announce('Story complete. Free roam.');
      }
    }
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_STEAL) audio.pickup();
  }

  // Actions are taken once per frame and shared with step(), so a press is
  // never consumed by the screen handler before the world sees it.
  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_SAVE && screen === SCREEN_PLAY) doSave();
    if (actions & ACTION_LOAD && screen === SCREEN_TITLE && hasSave) loadGame();
    else if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      // On the title screen, a fresh start; a click after being busted restarts.
      startGame(true);
    } else if (actions & ACTION_CONFIRM && screen === SCREEN_WIN) {
      screen = SCREEN_PLAY;
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { move: { x: 0, y: 0 } }, true);
      return;
    }
    const move = input.move();
    const events = world.step(STEP, {
      move,
      steer: input.steer(),
      throttle: input.throttle(),
      run: move.x !== 0 || move.y !== 0,
      enter: !!(actions & ACTION_ENTER),
      attack: !!(actions & ACTION_ATTACK) || input.takeClick(),
      aimAngle: world.state.player.angle,
    }, false);
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    audio.unlock();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_WIN) {
      // One-shot actions go to the first sub-step only: repeating them would
      // enter and immediately exit a car in the same frame.
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_WIN)) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const p = world.state.player;
    audio.update(p.inCar ? p.inCar.speed : 0, world.state.wanted);
    renderer.draw(world.state, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce(hasSave
    ? 'Solmar City. Press Space for a new game, or L to load your save.'
    : 'Solmar City. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
