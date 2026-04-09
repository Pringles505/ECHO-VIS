import { buildLinkRenderData, getAnimatedArrowHead } from '../links/linkGeometry';

export function computeLinkRenders(nodes, links) {
  const nodeMap = Object.fromEntries(nodes.map(node => [node.id, node]));
  const renders = {};

  for (const link of links) {
    const fromNode = nodeMap[link.fromId];
    const toNode = nodeMap[link.toId];
    if (!fromNode || !toNode) continue;
    renders[link.id] = buildLinkRenderData(link, fromNode, toNode, links);
  }

  return renders;
}

export function applyAnimState(layer, animState, linkRenders) {
  for (const [id, state] of Object.entries(animState.nodeStates)) {
    const group = layer.findOne(`#node-${id}`);
    if (!group) continue;
    group.opacity(state.opacity);
    group.scaleX(state.scale);
    group.scaleY(state.scale);
  }

  for (const [id, state] of Object.entries(animState.linkStates)) {
    const shaft = layer.findOne(`#link-shaft-${id}`);
    const head = layer.findOne(`#link-head-${id}`);
    if (!shaft) continue;

    const renderData = linkRenders[id];
    const totalLength = renderData?.length ?? 200;
    const dashLength = totalLength + 50;

    shaft.opacity(state.progress > 0.001 ? 1 : 0);
    shaft.dashEnabled(true);
    shaft.dash([dashLength, dashLength]);
    shaft.dashOffset(dashLength * (1 - state.progress));

    if (head && renderData) {
      const animatedHead = getAnimatedArrowHead(renderData, state.progress);
      head.points(animatedHead.points);
      head.opacity(head.getAttr('showTip') ? animatedHead.opacity : 0);
    }
  }
}

export function resetAnimState(layer, nodes, links) {
  for (const node of nodes) {
    const group = layer.findOne(`#node-${node.id}`);
    if (!group) continue;
    group.opacity(1);
    group.scaleX(1);
    group.scaleY(1);
  }

  for (const link of links) {
    const shaft = layer.findOne(`#link-shaft-${link.id}`);
    const head = layer.findOne(`#link-head-${link.id}`);
    if (!shaft) continue;

    shaft.dashEnabled(false);
    shaft.opacity(1);
    if (head) {
      head.points(head.getAttr('basePoints') ?? head.points());
      head.opacity(head.getAttr('showTip') ? 1 : 0);
    }
  }

  layer.draw();
}
