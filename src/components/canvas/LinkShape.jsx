import React from 'react';
import { Circle, Group, Line, Path } from 'react-konva';
import { pageColors } from '../../../colorThemes';
import { buildLinkRenderData, getLinkParallelOffset, JOINT_HIT_RADIUS } from '../../links/linkGeometry';

function LinkShape({
  link,
  allLinks,
  fromNode,
  toNode,
  isSelected,
  selectedJointId,
  onSelect,
  onContextMenu,
  onJointSelect,
  onJointDragStart,
  onJointDragMove,
  onJointDragEnd,
}) {
  const render = buildLinkRenderData(link, fromNode, toNode, allLinks);
  const renderJointMap = Object.fromEntries(render.jointRenderPoints.map(joint => [joint.id, joint]));
  const parallelOffset = getLinkParallelOffset(link, fromNode, toNode, allLinks);
  const color = isSelected ? pageColors.blueSelection : link.stroke;

  return (
    <Group>
      <Path
        data={render.pathData}
        stroke={pageColors.blackHitArea}
        strokeWidth={Math.max(14, link.strokeWidth + 12)}
        lineCap="round"
        lineJoin="round"
        onClick={(e) => { e.cancelBubble = true; onSelect(); }}
        onTap={(e) => { e.cancelBubble = true; onSelect(); }}
        onContextMenu={(e) => { e.cancelBubble = true; onContextMenu(e); }}
      />

      <Path
        id={`link-shaft-${link.id}`}
        data={render.pathData}
        stroke={color}
        strokeWidth={isSelected ? link.strokeWidth + 1 : link.strokeWidth}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />

      <Line
        id={`link-head-${link.id}`}
        points={render.arrowHeadPoints}
        basePoints={render.arrowHeadPoints}
        showTip={render.showArrowTip}
        closed
        fill={color}
        stroke={color}
        strokeWidth={1}
        opacity={render.showArrowTip ? 1 : 0}
        listening={false}
      />

      {isSelected && (link.joints ?? []).map((joint) => {
        const isJointSelected = selectedJointId === joint.id;
        const visibleRadius = Math.max(0, joint.size ?? 0);
        const renderJoint = renderJointMap[joint.id] ?? joint;
        return (
          <Group
            key={joint.id}
            x={renderJoint.x}
            y={renderJoint.y}
            draggable
            onDragStart={(e) => {
              e.cancelBubble = true;
              onJointDragStart(joint.id);
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              onJointDragMove(joint.id, {
                x: e.target.x() - parallelOffset.x,
                y: e.target.y() - parallelOffset.y,
              });
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              onJointDragEnd(joint.id, {
                x: e.target.x() - parallelOffset.x,
                y: e.target.y() - parallelOffset.y,
              });
            }}
            onClick={(e) => {
              e.cancelBubble = true;
              onJointSelect(joint.id);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onJointSelect(joint.id);
            }}
          >
            <Circle
              radius={JOINT_HIT_RADIUS}
              fill={pageColors.blackHitArea}
              strokeEnabled={false}
            />
            <Circle
              radius={visibleRadius}
              fill={isJointSelected ? pageColors.warningMain : pageColors.blueSurfaceSoft}
              stroke={isJointSelected ? pageColors.warningSoft : pageColors.blueLink}
              strokeWidth={visibleRadius > 0 ? 2 : 0}
              opacity={visibleRadius > 0 ? 1 : 0}
              listening={false}
            />
            {visibleRadius <= 0 && isJointSelected && (
              <Circle
                radius={5}
                stroke={pageColors.warningSoft}
                strokeWidth={1.5}
                dash={[3, 3]}
                listening={false}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

export default LinkShape;
