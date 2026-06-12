// Thin store-aware wrapper around the alignment engine, shared by every
// draggable shape (NodeShape, SubdiagramShape, MirrorShape). Reads everything
// it needs from the store on demand so shapes don't have to subscribe to the
// nodes array (which would re-render every shape on every drag frame).
import useStore from '../../store/useStore';
import { resolveMoveSnap } from './alignmentEngine';

// box: { id, x, y, width, height } raw pointer-derived position.
// e: the Konva drag event (for stage scale and modifier keys).
// dragOrigin: { x, y } position at drag start — enables Shift axis-lock.
// Returns { x, y, guides }.
export function snapDraggedBox(box, e, dragOrigin) {
  const state = useStore.getState();
  // Nodes moving together with the drag must not act as snap targets.
  const excludeIds = new Set(
    [...(state.selectedIds ?? []), state.selectedId, box.id].filter(Boolean)
  );
  return resolveMoveSnap(box, {
    nodes: state.nodes,
    settings: state.alignment,
    scale: e.target.getStage()?.scaleX() ?? 1,
    disableSnap: !!e.evt?.altKey,
    excludeIds,
    axisLock: e.evt?.shiftKey && dragOrigin ? dragOrigin : null,
  });
}
