import { describe, expect, it } from 'vitest';
import { AnimationEngine } from './AnimationEngine';

const node = (id, overrides = {}) => ({
  id,
  type: 'node',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  label: id,
  ...overrides,
});

const link = (id, fromId, toId, overrides = {}) => ({
  id,
  fromId,
  toId,
  joints: [],
  ...overrides,
});

const eventById = (engine, id) => engine.getTimeline().find(ev => ev.id === id);

describe('AnimationEngine timeline', () => {
  it('sequences free nodes one after another from the initial delay', () => {
    const engine = new AnimationEngine([node('a'), node('b')], [], {
      initialDelay: 0.3, nodeDuration: 0.5, nodeGap: 0.1,
    });
    const a = eventById(engine, 'a');
    const b = eventById(engine, 'b');
    expect(a.start).toBeCloseTo(0.3);
    expect(a.duration).toBeCloseTo(0.5);
    expect(b.start).toBeCloseTo(0.3 + 0.5 + 0.1);
  });

  it('respects explicit animStartTime and animDuration', () => {
    const engine = new AnimationEngine(
      [node('a', { animStartTime: 4, animDuration: 2 })], []
    );
    const a = eventById(engine, 'a');
    expect(a.start).toBe(4);
    expect(a.duration).toBe(2);
  });

  it('schedules links after the node phase plus the link start pause', () => {
    const engine = new AnimationEngine(
      [node('a'), node('b')],
      [link('l1', 'a', 'b')],
      { initialDelay: 0, nodeDuration: 1, nodeGap: 0, linkStartPause: 0.2, linkDuration: 0.5 }
    );
    const l1 = eventById(engine, 'l1');
    // Two nodes (1s each, no gap) then the pause.
    expect(l1.start).toBeCloseTo(2.2);
    expect(l1.duration).toBeCloseTo(0.5);
  });

  it('starts an on-end triggered node when its trigger link finishes', () => {
    const engine = new AnimationEngine(
      [
        node('a'),
        node('b', { triggerAfterLinkId: 'l1', triggerMode: 'on-end', triggerDelay: 0 }),
      ],
      [link('l1', 'a', 'b', { animStartTime: 3, animDuration: 1 })]
    );
    const b = eventById(engine, 'b');
    expect(b.start).toBeCloseTo(4);
  });

  it('excludes mirror nodes from the timeline', () => {
    const engine = new AnimationEngine(
      [node('a'), node('m', { type: 'mirror' })], []
    );
    expect(eventById(engine, 'm')).toBeUndefined();
    expect(eventById(engine, 'a')).toBeDefined();
  });

  it('keeps total duration at least contentDuration plus holdAfter', () => {
    const engine = new AnimationEngine([node('a')], [], { holdAfter: 1.2 });
    expect(engine.getTotalDuration()).toBeGreaterThanOrEqual(
      engine.getContentDuration() + 1.2 - 1e-9
    );
  });

  it('extends content duration to cover failure keyframes', () => {
    const engine = new AnimationEngine(
      [node('a', { failureKeyframes: [{ id: 'f1', startTime: 9, duration: 1 }] })], []
    );
    expect(engine.getContentDuration()).toBeGreaterThanOrEqual(10);
  });
});

describe('AnimationEngine.getStateAtTime', () => {
  it('holds entry at 0 before start and completes after end', () => {
    const engine = new AnimationEngine(
      [node('a', { animStartTime: 1, animDuration: 1 })], []
    );
    expect(engine.getStateAtTime(0).nodeStates.a.opacity).toBe(0);
    const done = engine.getStateAtTime(5).nodeStates.a;
    expect(done.opacity).toBeCloseTo(1);
    expect(done.scale).toBeCloseTo(1);
  });

  it('reports link progress 0 before and 1 after the draw window', () => {
    const engine = new AnimationEngine(
      [node('a'), node('b')],
      [link('l1', 'a', 'b', { animStartTime: 2, animDuration: 1 })]
    );
    expect(engine.getStateAtTime(0).linkStates.l1.progress).toBe(0);
    expect(engine.getStateAtTime(10).linkStates.l1.progress).toBeCloseTo(1);
  });

  it('pops a disableAnimation link fully drawn at its keyframe', () => {
    const engine = new AnimationEngine(
      [node('a'), node('b')],
      [link('l1', 'a', 'b', { animStartTime: 2, animDuration: 1, disableAnimation: true })]
    );
    expect(engine.getStateAtTime(1.99).linkStates.l1.progress).toBe(0);
    expect(engine.getStateAtTime(2.01).linkStates.l1.progress).toBe(1);
  });
});

describe('AnimationEngine variable webs', () => {
  it('caches getVariableWebs and computes hop timing from the final timeline', () => {
    const nodes = [
      node('v', { type: 'variable', variableLabel: 'x', animStartTime: 0, animDuration: 1 }),
      node('a'),
    ];
    const links = [link('l1', 'v', 'a', { animStartTime: 0, animDuration: 2 })];
    const engine = new AnimationEngine(nodes, links);
    const webs = engine.getVariableWebs();
    expect(engine.getVariableWebs()).toBe(webs); // cached
    expect(webs).toHaveLength(1);
    // Hop waits for both the variable draw end (1) and the link draw end (2).
    expect(webs[0].tokenTiming.l1.start).toBeCloseTo(2);
  });
});
