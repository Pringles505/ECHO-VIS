import { describe, expect, it } from 'vitest';
import { computeVariableWebs, buildWebByLinkId } from './flow';

const variable = (id, overrides = {}) => ({
  id,
  type: 'variable',
  variableLabel: 'x',
  tokenHopDuration: 1,
  animStartTime: 0,
  animDuration: 0,
  ...overrides,
});

const node = (id, overrides = {}) => ({ id, type: 'node', ...overrides });
const link = (id, fromId, toId, overrides = {}) => ({ id, fromId, toId, ...overrides });

describe('computeVariableWebs', () => {
  it('walks everything reachable downstream from the variable', () => {
    const nodes = [variable('v'), node('a'), node('b'), node('unrelated')];
    const links = [link('l1', 'v', 'a'), link('l2', 'a', 'b'), link('lx', 'unrelated', 'b')];
    const [web] = computeVariableWebs(nodes, links);
    expect([...web.linkIds].sort()).toEqual(['l1', 'l2']);
    expect(web.tokenPath).toEqual(['l1', 'l2']);
    expect(web.nodeIds.has('b')).toBe(true);
    expect(web.linkIds.has('lx')).toBe(false);
  });

  it('produces no web for a variable with no name, value, or token text', () => {
    const nodes = [variable('v', { variableLabel: '' })];
    expect(computeVariableWebs(nodes, [])).toHaveLength(0);
  });

  it('chains hops: each waits for the upstream hop and its own link draw end', () => {
    const nodes = [variable('v'), node('a'), node('b')];
    const links = [link('l1', 'v', 'a'), link('l2', 'a', 'b')];
    const timeline = [
      { type: 'node', id: 'v', start: 0, duration: 1 },
      { type: 'link', id: 'l1', start: 0, duration: 3 },   // draw ends at 3
      { type: 'link', id: 'l2', start: 0, duration: 0.5 }, // already drawn when token lands
    ];
    const [web] = computeVariableWebs(nodes, links, { timeline });
    expect(web.tokenTiming.l1.start).toBeCloseTo(3); // waits for link draw
    expect(web.tokenTiming.l2.start).toBeCloseTo(4); // waits for upstream hop end (3 + 1)
    expect(web.arrivalAtNode.b).toBeCloseTo(5);
  });

  it('skips hops marked tokenHopSkip with zero duration', () => {
    const nodes = [variable('v'), node('a'), node('b')];
    const links = [link('l1', 'v', 'a', { tokenHopSkip: true }), link('l2', 'a', 'b')];
    const [web] = computeVariableWebs(nodes, links);
    expect(web.tokenTiming.l1.skipped).toBe(true);
    expect(web.tokenTiming.l1.duration).toBe(0);
  });

  it('lets per-variable overrides beat link-level settings, including negative delay', () => {
    const nodes = [variable('v'), node('a')];
    const links = [link('l1', 'v', 'a', {
      tokenHopDelay: 5,
      tokenHopOverrides: { v: { delay: -0.5, duration: 2 } },
    })];
    const timeline = [{ type: 'link', id: 'l1', start: 0, duration: 1 }];
    const [web] = computeVariableWebs(nodes, links, { timeline });
    expect(web.tokenTiming.l1.start).toBeCloseTo(0.5); // naturalStart 1 + (-0.5)
    expect(web.tokenTiming.l1.duration).toBe(2);
  });

  it('stops traversal at a node that kills the token for this variable', () => {
    const nodes = [variable('v'), node('a', { tokenKillFor: { v: true } }), node('b')];
    const links = [link('l1', 'v', 'a'), link('l2', 'a', 'b')];
    const [web] = computeVariableWebs(nodes, links);
    expect(web.linkIds.has('l1')).toBe(true);
    expect(web.linkIds.has('l2')).toBe(false);
  });
});

describe('buildWebByLinkId', () => {
  it('assigns shared links to the first web that owns them', () => {
    const nodes = [variable('v1'), variable('v2'), node('a')];
    const links = [link('l1', 'v1', 'a'), link('l2', 'v2', 'a')];
    const webs = computeVariableWebs(nodes, links);
    const byLink = buildWebByLinkId(webs);
    expect(byLink.l1.sourceNodeId).toBe('v1');
    expect(byLink.l2.sourceNodeId).toBe('v2');
  });
});
