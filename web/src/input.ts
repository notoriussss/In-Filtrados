// Keyboard input (S1-19): WASD and the arrows give a direction, and move
// is sent only when that direction changes, never once per frame.

export type Axis = -1 | 0 | 1;
export type Direction = { dx: Axis; dy: Axis };

// KeyboardEvent.code, so WASD works the same with any keyboard layout.
const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: { dx: 0, dy: -1 },
  KeyW: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  KeyS: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  KeyA: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  KeyD: { dx: 1, dy: 0 },
};

export function isMovementKey(code: string): boolean {
  return code in KEY_DIRECTIONS;
}

// directionOf adds up the pressed keys; opposite keys cancel out.
export function directionOf(pressed: Iterable<string>): Direction {
  let dx = 0;
  let dy = 0;
  for (const code of new Set(pressed)) {
    const dir = KEY_DIRECTIONS[code];
    if (!dir) continue;
    dx += dir.dx;
    dy += dir.dy;
  }
  return { dx: sign(dx), dy: sign(dy) };
}

function sign(v: number): Axis {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

// DirectionInput tracks the pressed keys and calls onChange only when the
// direction is different from the last one it reported.
export class DirectionInput {
  private readonly pressed = new Set<string>();
  private last: Direction = { dx: 0, dy: 0 };

  constructor(private readonly onChange: (dir: Direction) => void) {}

  // current is the last direction reported.
  current(): Direction {
    return this.last;
  }

  // keyDown returns true if the key moves the player.
  keyDown(code: string): boolean {
    if (!isMovementKey(code)) return false;
    this.pressed.add(code);
    this.update();
    return true;
  }

  keyUp(code: string): void {
    if (!this.pressed.delete(code)) return;
    this.update();
  }

  // clear stops the player, e.g. when the window loses focus.
  clear(): void {
    this.pressed.clear();
    this.update();
  }

  // attach listens on target and returns the function that stops it.
  attach(target: Window): () => void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (this.keyDown(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => this.keyUp(e.code);
    const onBlur = () => this.clear();
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    };
  }

  private update(): void {
    const dir = directionOf(this.pressed);
    if (dir.dx === this.last.dx && dir.dy === this.last.dy) return;
    this.last = dir;
    this.onChange(dir);
  }
}

// Writing in a text field (the chat, later) must not move the player.
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
}
