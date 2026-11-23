// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// the world's own autopilot (drive toward the mission target, steal a car when
// close), so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 18;
const CHASE_SECONDS = 16;

export function stageShot(name, world) {
  world.reset();
  const st = world.state;
  if (name === 'play' || name === 'chase') {
    if (name === 'chase') {
      // Jump to the heat: wanted level 3 with police already chasing.
      st.wanted = 3;
      world.startMission(2);
    }
    const limit = name === 'chase' ? CHASE_SECONDS : PLAY_SECONDS;
    for (let i = 0; i < limit / STEP; i += 1) {
      world.step(STEP, world.driveInput(), false);
      if (st.busted) break;
    }
    return { screen: SCREEN_PLAY, best: st.cash };
  }
  if (name === 'end') {
    // Play the whole story through with the autopilot, like a real run: the
    // final frame is the STORY COMPLETE screen over the city. With seed 1
    // the autopilot finishes all five missions; if it ever gets busted
    // instead, show the honest BUSTED screen rather than a staged win.
    for (let i = 0; i < 600 / STEP; i += 1) {
      world.step(STEP, world.driveInput(), false);
      if (st.storyDone || st.busted) break;
    }
    return { screen: st.storyDone ? SCREEN_WIN : SCREEN_OVER, best: st.cash };
  }
  // start: the title screen over a living city.
  for (let i = 0; i < START_SECONDS / STEP; i += 1) {
    world.step(STEP, { move: { x: 0, y: 0 } }, true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
