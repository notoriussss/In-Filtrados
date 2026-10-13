import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountHud } from './hud';
import { ACTION_TEXT, HUD_TEXT } from './constants';

type FakeElement = {
  hidden: boolean;
  disabled?: boolean;
  textContent: string;
  className?: string;
  style: Record<string, string>;
  querySelector: (sel: string) => FakeElement | null;
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener: (event: string, handler: () => void) => void;
  blur: () => void;
};

function createFakeHudDom() {
  const fill: FakeElement = {
    hidden: false,
    textContent: '',
    style: {},
    querySelector: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    blur: vi.fn(),
  };

  const reservoirLabel: FakeElement = {
    hidden: false,
    textContent: '',
    style: {},
    querySelector: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    blur: vi.fn(),
  };

  const reservoir: FakeElement = {
    hidden: true,
    textContent: '',
    style: {},
    querySelector: (sel: string) => {
      if (sel === '.reservoir-fill') return fill;
      if (sel === '.reservoir-label') return reservoirLabel;
      return null;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    blur: vi.fn(),
  };

  const actionLabel: FakeElement = {
    hidden: false,
    textContent: '',
    style: {},
    querySelector: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    blur: vi.fn(),
  };

  const actionKey: FakeElement = {
    hidden: false,
    textContent: '',
    style: {},
    querySelector: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    blur: vi.fn(),
  };

  let clickHandler: (() => void) | undefined;
  const button: FakeElement = {
    hidden: true,
    disabled: false,
    textContent: '',
    className: '',
    style: {},
    querySelector: (sel: string) => {
      if (sel === '.action-label') return actionLabel;
      if (sel === '.action-key') return actionKey;
      return null;
    },
    addEventListener: (event: string, handler: () => void) => {
      if (event === 'click') clickHandler = handler;
    },
    removeEventListener: vi.fn(),
    blur: vi.fn(),
  };

  const alert: FakeElement = {
    hidden: true,
    textContent: '',
    style: {},
    querySelector: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    blur: vi.fn(),
  };

  const elements: Record<string, FakeElement> = {
    reservoir,
    'action-button': button,
    'tank-alert': alert,
  };

  return {
    elements,
    fill,
    reservoirLabel,
    reservoir,
    button,
    actionLabel,
    actionKey,
    alert,
    triggerClick: () => clickHandler?.(),
  };
}

describe('mountHud', () => {
  let originalDocument: unknown;
  let dom: ReturnType<typeof createFakeHudDom>;

  beforeEach(() => {
    dom = createFakeHudDom();
    originalDocument = (globalThis as any).document;
    (globalThis as any).document = {
      getElementById: (id: string) => dom.elements[id] ?? null,
    };
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
  });

  it('initializes keys and text properly', () => {
    const onAction = vi.fn();
    const hud = mountHud(onAction);
    expect(dom.actionKey.textContent).toBe(ACTION_TEXT.KEY_HINT);
    expect(dom.alert.textContent).toBe(HUD_TEXT.TANK_ALERT);
    hud.destroy();
  });

  it('updates reservoir width and label or hides on null', () => {
    const hud = mountHud(vi.fn());
    hud.setReservoir(50);
    expect(dom.reservoir.hidden).toBe(false);
    expect(dom.fill.style.width).toBe('50%');
    expect(dom.reservoirLabel.textContent).toBe('Embalse 50 %');

    hud.setReservoir(null);
    expect(dom.reservoir.hidden).toBe(true);
    hud.destroy();
  });

  it('updates action button label, disabled state, and class', () => {
    const onAction = vi.fn();
    const hud = mountHud(onAction);
    hud.setAction({
      kind: 'contaminate',
      label: ACTION_TEXT.CONTAMINATE,
      enabled: true,
      tankSlot: 1,
    });
    expect(dom.button.hidden).toBe(false);
    expect(dom.actionLabel.textContent).toBe(ACTION_TEXT.CONTAMINATE);
    expect(dom.button.disabled).toBe(false);
    expect(dom.button.className).toContain('contaminate');

    dom.triggerClick();
    expect(onAction).toHaveBeenCalledOnce();
    expect(dom.button.blur).toHaveBeenCalled();

    hud.setAction(null);
    expect(dom.button.hidden).toBe(true);
    hud.destroy();
  });

  it('shows, hides and auto-dismisses tank alert', () => {
    vi.useFakeTimers();
    const hud = mountHud(vi.fn());
    hud.showTankAlert();
    expect(dom.alert.hidden).toBe(false);

    vi.advanceTimersByTime(3000);
    expect(dom.alert.hidden).toBe(true);

    hud.showTankAlert();
    expect(dom.alert.hidden).toBe(false);
    hud.hideTankAlert();
    expect(dom.alert.hidden).toBe(true);

    vi.useRealTimers();
    hud.destroy();
  });
});
