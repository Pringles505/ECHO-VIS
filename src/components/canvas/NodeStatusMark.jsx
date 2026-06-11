import React from 'react';
import { Circle, Group, Line, Rect, Text } from 'react-konva';
import { pageColors } from '../../colorThemes';

export function getNodeStatusStroke(node, fallback) {
  if (node?.failing) return pageColors.dangerBright;
  if (node?.offline) return pageColors.textMuted;
  return fallback;
}

export function getNodeStatusTextColor(node, fallback) {
  return node?.offline ? pageColors.textMuted : fallback;
}

export function getNodeStatusDash(node) {
  return node?.offline ? [7, 4] : undefined;
}

export default function NodeStatusMark({ node }) {
  const hasFailureMark = !!node?.failing || (node?.failureKeyframes?.length ?? 0) > 0;
  const cx = node.width / 2;
  const cy = node.height / 2;
  const size = Math.max(9, Math.min(node.width, node.height) * 0.28);
  const strokeWidth = Math.max(2.5, (node.strokeWidth ?? 2) * 1.1);
  const width = Math.min(54, Math.max(44, node.width - 12));
  const height = 14;
  const x = 6;
  const y = Math.max(4, node.height - height - 5);

  if (!hasFailureMark && !node?.offline) return null;

  return (
    <>
      {hasFailureMark && (
        <Group id={`node-fail-${node.id}`} x={cx} y={cy} opacity={node.failing ? 1 : 0} listening={false}>
        <Circle radius={size + 7} fill={pageColors.dangerMain} opacity={0.18} />
        <Circle radius={size + 3} stroke={pageColors.dangerBright} strokeWidth={1} opacity={0.35} />
        <Line points={[-size, -size, size, size]} stroke={pageColors.dangerBright} strokeWidth={strokeWidth} lineCap="round" />
        <Line points={[size, -size, -size, size]} stroke={pageColors.dangerBright} strokeWidth={strokeWidth} lineCap="round" />
        </Group>
      )}
      {node?.offline && (
        <Group id={`node-offline-${node.id}`} x={x} y={y} listening={false}>
          <Rect
            width={width}
            height={height}
            cornerRadius={4}
            fill={pageColors.uiRaised}
            stroke={pageColors.textMuted}
            strokeWidth={1}
            dash={[3, 2]}
            opacity={0.96}
          />
          <Circle x={7} y={height / 2} radius={2.4} fill={pageColors.textMuted} />
          <Text
            x={13}
            y={0}
            width={width - 15}
            height={height}
            text="OFFLINE"
            align="center"
            verticalAlign="middle"
            fontSize={7.5}
            fontFamily="Inter, system-ui, sans-serif"
            fontStyle="700"
            letterSpacing={0.5}
            fill={pageColors.textMuted}
          />
        </Group>
      )}
    </>
  );
}
