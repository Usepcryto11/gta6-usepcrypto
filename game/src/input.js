// Keyboard and pointer input. Held keys give a movement vector; one-shot presses
// (confirm, pause, enter/exit car, attack, save, mute) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost or counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_ATTACK = 8;
export const ACTION_SAVE = 16;
export const ACTION_MUTE = 32;
export const ACTION_LOAD = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const ATTACK = new Set(['Space']);
const SAVE = new Set(['KeyG']);
const MUTE = new Set(['KeyM']);
const LOAD = new Set(['KeyL']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouse = { x: 0, y: 0, down: false };
  let clicked = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (ATTACK.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ATTACK;
    } else if (SAVE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SAVE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (LOAD.has(event.code)) {
      if (!event.repeat) actions |= ACTION_LOAD;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    clicked = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function has(codes) {
    for (const c of codes) if (held.has(c)) return true;
    return false;
  }

  return {
    /** Movement vector {x, y} in -1..1, normalised. */
    move() {
      const x = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const y = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** -1, 0 or 1: steering for a car (left / right). */
    steer() {
      return (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
    },
    /** 1 when accelerating, -1 when reversing/braking, 0 otherwise. */
    throttle() {
      return (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0);
    },
    mouse() {
      return mouse;
    },
    /** True once when the pointer was pressed since the last call. */
    takeClick() {
      const c = clicked;
      clicked = false;
      return c;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
