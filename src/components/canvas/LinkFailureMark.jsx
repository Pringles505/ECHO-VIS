import React from 'react';
import { Circle, Group, Line } from 'react-konva';
import { pageColors } from '../../colorThemes';
import { getPointAtProgress } from '../../links/linkGeometry';

export default function LinkFailureMark({ link, render }) {
  if (!link || !render || (!link.failing && !link.failAtEnds && !link.failOnTokenEnd)) return null;
  const midpoint = getPointAtProgress(render, 0.5, true)?.point ?? render.endPoint;
  const size = Math.max(7, 4 + (link.strokeWidth ?? 2) * 1.4);
  const strokeWidth = Math.max(2, (link.strokeWidth ?? 2) * 0.85);

  return (
    <Group
      id={`link-fail-${link.id}`}
      x={midpoint.x}
      y={midpoint.y}
      opacity={link.failing ? 1 : 0}
      listening={false}
    >
      <Circle radius={size + 6} fill={pageColors.dangerMain} opacity={0.18} />
      <Circle radius={size + 2} stroke={pageColors.dangerBright} strokeWidth={1} opacity={0.35} />
      <Line points={[-size, -size, size, size]} stroke={pageColors.dangerBright} strokeWidth={strokeWidth} lineCap="round" />
      <Line points={[size, -size, -size, size]} stroke={pageColors.dangerBright} strokeWidth={strokeWidth} lineCap="round" />
    </Group>
  );
}
