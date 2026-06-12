import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALIGNMENT_SETTINGS,
  orthogonalizeJointPoint,
  resolveJointSnap,
  resolveMoveSnap,
} from './alignmentEngine';

const settings = (overrides = {}) => ({ ...DEFAULT_ALIGNMENT_SETTINGS, ...overrides });

const node = (id, x, y, width = 100, height = 50) => ({ id, x, y, width, height });

describe('resolveMoveSnap — object alignment', () => {
  it('snaps left edges on the x axis', () => {
    const target = node('a', 200, 0);
    const moving = { id: 'm', x: 205, y: 300, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, { nodes: [target], settings: settings() });
    expect(result.x).toBe(200);
    expect(result.y).toBe(300); // y unaffected (no nearby y edge)
  });

  it('snaps centers to centers', () => {
    const target = node('a', 200, 0, 100, 50); // center x = 250
    const moving = { id: 'm', x: 196, y: 300, width: 100, height: 50 }; // center x = 246
    const result = resolveMoveSnap(moving, { nodes: [target], settings: settings() });
    expect(result.x).toBe(200); // center 250 == target center
  });

  it('snaps both axes independently and simultaneously', () => {
    const a = node('a', 200, 0);
    const b = node('b', 0, 400);
    const moving = { id: 'm', x: 204, y: 396, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, { nodes: [a, b], settings: settings() });
    expect(result.x).toBe(200); // left edge of a
    expect(result.y).toBe(400); // top edge of b
  });

  it('does not snap beyond the tolerance', () => {
    const target = node('a', 200, 0);
    const moving = { id: 'm', x: 215, y: 300, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, { nodes: [target], settings: settings() });
    expect(result.x).toBe(215);
  });

  it('scales the tolerance with zoom (tight when zoomed in)', () => {
    const target = node('a', 200, 0);
    const moving = { id: 'm', x: 205, y: 300, width: 100, height: 50 };
    const zoomedIn = resolveMoveSnap(moving, { nodes: [target], settings: settings(), scale: 4 });
    expect(zoomedIn.x).toBe(205); // 5px > 8/4 = 2px tolerance
    const zoomedOut = resolveMoveSnap(moving, { nodes: [target], settings: settings(), scale: 0.5 });
    expect(zoomedOut.x).toBe(200); // 5px < 8/0.5 = 16px tolerance
  });

  it('ignores excluded (co-selected) nodes as snap targets', () => {
    const target = node('a', 200, 0);
    const moving = { id: 'm', x: 205, y: 300, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, {
      nodes: [target],
      settings: settings(),
      excludeIds: new Set(['a']),
    });
    expect(result.x).toBe(205);
  });

  it('returns raw position when snapping is paused (Alt)', () => {
    const target = node('a', 200, 0);
    const moving = { id: 'm', x: 205, y: 300, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, { nodes: [target], settings: settings(), disableSnap: true });
    expect(result.x).toBe(205);
    expect(result.guides).toEqual([]);
  });

  it('produces full-span guide lines for every matched edge', () => {
    // Equal-width boxes snapped on left edges also align centers and right
    // edges → 3 vertical guides, like Figma.
    const target = node('a', 200, 0, 100, 50);
    const moving = { id: 'm', x: 203, y: 300, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, { nodes: [target], settings: settings() });
    expect(result.x).toBe(200);
    const verticalGuides = result.guides.filter(g => g.id.startsWith('align-x'));
    expect(verticalGuides.length).toBe(3);
    // Lines span both boxes (target top 0 → moving bottom 350) plus padding.
    for (const guide of verticalGuides) {
      expect(guide.points[1]).toBeLessThan(0);
      expect(guide.points[3]).toBeGreaterThan(350);
    }
  });
});

describe('resolveMoveSnap — axis lock (Shift)', () => {
  it('locks to the dominant axis relative to the drag origin', () => {
    const moving = { id: 'm', x: 150, y: 108, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, {
      nodes: [],
      settings: settings(),
      axisLock: { x: 100, y: 100 }, // dx=50 > dy=8 → y locks to origin
    });
    expect(result.x).toBe(150);
    expect(result.y).toBe(100);
  });
});

describe('resolveMoveSnap — equal spacing', () => {
  it('snaps so the gap to the previous box equals the existing gap', () => {
    // a: [0..100], b: [140..240] → gap 40. Moving near x=283 should land at 280.
    const a = node('a', 0, 0);
    const b = node('b', 140, 0);
    const moving = { id: 'm', x: 283, y: 10, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, { nodes: [a, b], settings: settings() });
    expect(result.x).toBe(280);
    expect(result.guides.some(g => g.label?.text === '40')).toBe(true);
  });

  it('snaps centered between two boxes', () => {
    // a: [0..100], b: [300..400] → space 200, moving w=100 → centered at 150.
    const a = node('a', 0, 0);
    const b = node('b', 300, 0);
    const moving = { id: 'm', x: 154, y: 10, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, { nodes: [a, b], settings: settings({ snapToObjects: true })  });
    expect(result.x).toBe(150);
  });

  it('ignores boxes on a different row', () => {
    const a = node('a', 0, 500);
    const b = node('b', 140, 500);
    const moving = { id: 'm', x: 283, y: 10, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, { nodes: [a, b], settings: settings() });
    expect(result.x).toBe(283);
  });

  it('can be disabled via settings', () => {
    const a = node('a', 0, 0);
    const b = node('b', 140, 0);
    const moving = { id: 'm', x: 283, y: 10, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, { nodes: [a, b], settings: settings({ snapSpacing: false }) });
    expect(result.x).toBe(283);
  });
});

describe('resolveMoveSnap — grid', () => {
  it('quantizes free axes to the grid when enabled', () => {
    const moving = { id: 'm', x: 130, y: 119, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, {
      nodes: [],
      settings: settings({ snapToGrid: true, gridSize: 24 }),
    });
    expect(result.x).toBe(120); // nearest multiple of 24 to 130 is 120
    expect(result.y).toBe(120);
  });

  it('object alignment beats the grid', () => {
    const target = node('a', 130, 0); // off-grid target
    const moving = { id: 'm', x: 133, y: 300, width: 100, height: 50 };
    const result = resolveMoveSnap(moving, {
      nodes: [target],
      settings: settings({ snapToGrid: true, gridSize: 24 }),
    });
    expect(result.x).toBe(130); // aligned with the node, not the grid
  });
});

describe('resolveJointSnap', () => {
  it('snaps a joint orthogonally to its neighbours', () => {
    const result = resolveJointSnap({ x: 103, y: 200 }, {
      neighbors: [{ x: 100, y: 50 }, { x: 400, y: 196 }],
      nodes: [],
      settings: settings(),
    });
    expect(result.x).toBe(100); // vertical segment to first neighbour
    expect(result.y).toBe(196); // horizontal segment to second neighbour
    expect(result.guides.length).toBe(2);
  });

  it('aligns a free axis with node edges', () => {
    const result = resolveJointSnap({ x: 203, y: 200 }, {
      neighbors: [],
      nodes: [node('a', 200, 0)],
      settings: settings(),
    });
    expect(result.x).toBe(200);
  });

  it('quantizes to the grid when nothing else matched', () => {
    const result = resolveJointSnap({ x: 130, y: 119 }, {
      neighbors: [],
      nodes: [],
      settings: settings({ snapToGrid: true, gridSize: 24, snapToObjects: false }),
    });
    expect(result.x).toBe(120);
    expect(result.y).toBe(120);
  });
});

describe('orthogonalizeJointPoint', () => {
  it('squares up the closest axis only', () => {
    const result = orthogonalizeJointPoint({ x: 103, y: 150 }, [
      { x: 100, y: 50 },
      { x: 400, y: 160 },
    ]);
    expect(result).toEqual({ x: 100, y: 150 }); // dx=3 < dy=10
  });
});
