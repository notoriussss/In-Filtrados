import { describe, expect, it } from 'vitest';
import { type Direction, DirectionInput, directionOf } from './input';

function recorder() {
  const sent: Direction[] = [];
  const input = new DirectionInput((dir) => sent.push(dir));
  return { input, sent };
}

describe('directionOf', () => {
  it('reads WASD and the arrows', () => {
    expect(directionOf(['KeyW'])).toEqual({ dx: 0, dy: -1 });
    expect(directionOf(['ArrowDown'])).toEqual({ dx: 0, dy: 1 });
    expect(directionOf(['KeyA', 'ArrowUp'])).toEqual({ dx: -1, dy: -1 });
    expect(directionOf(['KeyD', 'KeyS'])).toEqual({ dx: 1, dy: 1 });
  });

  it('cancels opposite keys and ignores the rest', () => {
    expect(directionOf(['KeyA', 'KeyD'])).toEqual({ dx: 0, dy: 0 });
    expect(directionOf(['ArrowUp', 'KeyW'])).toEqual({ dx: 0, dy: -1 });
    expect(directionOf(['KeyE', 'Space'])).toEqual({ dx: 0, dy: 0 });
  });
});

describe('DirectionInput', () => {
  it('sends one move while a key is held, not one per repeat', () => {
    const { input, sent } = recorder();
    // Holding an arrow 3 s: the browser repeats keydown many times.
    for (let i = 0; i < 180; i++) input.keyDown('ArrowRight');
    expect(sent).toEqual([{ dx: 1, dy: 0 }]);
    input.keyUp('ArrowRight');
    expect(sent).toEqual([
      { dx: 1, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
  });

  it('sends again only when the direction changes', () => {
    const { input, sent } = recorder();
    input.keyDown('KeyW');
    input.keyDown('ArrowUp'); // same direction
    input.keyDown('KeyD'); // now diagonal
    input.keyUp('KeyW'); // ArrowUp still held
    input.keyUp('ArrowUp');
    expect(sent).toEqual([
      { dx: 0, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 0 },
    ]);
  });

  it('stops the player when cleared', () => {
    const { input, sent } = recorder();
    input.keyDown('KeyA');
    input.clear();
    input.clear();
    expect(sent).toEqual([
      { dx: -1, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
  });

  it('ignores keys that do not move', () => {
    const { input, sent } = recorder();
    expect(input.keyDown('KeyE')).toBe(false);
    input.keyUp('KeyE');
    expect(sent).toEqual([]);
  });
});

describe('DirectionInput.current', () => {
  it('keeps the last direction sent', () => {
    const { input } = recorder();
    input.keyDown('KeyS');
    expect(input.current()).toEqual({ dx: 0, dy: 1 });
  });
});
