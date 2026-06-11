const MIN_TOKEN_DURATION = 0.05;
const MANUAL_TOKEN_TRACK_PREFIX = 'manual-token:';

export function getManualTokenTrackId(linkId) {
  return `${MANUAL_TOKEN_TRACK_PREFIX}${linkId}`;
}

export function getManualTokenLinkId(trackId) {
  return typeof trackId === 'string' && trackId.startsWith(MANUAL_TOKEN_TRACK_PREFIX)
    ? trackId.slice(MANUAL_TOKEN_TRACK_PREFIX.length)
    : null;
}

export function normalizeManualTokenTextKeyframes(keyframes = []) {
  return [...(keyframes ?? [])]
    .map((keyframe, index) => ({
      id: keyframe?.id ?? `manual-token-text-${index}`,
      time: Math.max(0, Number.isFinite(keyframe?.time) ? keyframe.time : 0),
      text: keyframe?.text == null ? '' : String(keyframe.text),
    }))
    .sort((a, b) => a.time - b.time);
}

export function getManualTokenBaseText(link, fallback = '') {
  return (link?.manualTokenVariableValue ?? '').trim()
    || (link?.messageLabel ?? '').trim()
    || fallback;
}

export function getManualTokenTextAtTime(source, time, fallback = '') {
  let text = source?.baseText ?? getManualTokenBaseText(source, fallback);
  const keyframes = normalizeManualTokenTextKeyframes(
    source?.textKeyframes ?? source?.manualTokenTextKeyframes
  );
  for (const keyframe of keyframes) {
    if (keyframe.time > time) break;
    text = keyframe.text;
  }
  return text;
}

export function getManualTokenDuration(link, linkEvent) {
  const configured = Number(link?.manualTokenDuration);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(MIN_TOKEN_DURATION, configured);
  }
  return Math.max(MIN_TOKEN_DURATION, linkEvent?.duration ?? MIN_TOKEN_DURATION);
}

export function computeManualTokenTimingByLinkId(links = [], timeline = []) {
  const eventById = Object.fromEntries(
    timeline
      .filter(event => event.type === 'link')
      .map(event => [event.id, event])
  );
  const timingById = {};

  for (const link of links) {
    if (!link.manualTokenEnabled) continue;
    const event = eventById[link.id];
    if (!event) continue;

    const anchorAtEnd = link.manualTokenAnchor === 'end';
    const delay = Number.isFinite(link.manualTokenDelay) ? link.manualTokenDelay : 0;
    const anchorTime = anchorAtEnd ? event.start + event.duration : event.start;
    const start = anchorTime + delay;
    const duration = getManualTokenDuration(link, event);
    const invert = !!link.manualTokenInvert;
    const variableName = (link.manualTokenVariableName ?? '').trim()
      || (link.messageLabel ?? '').trim()
      || 'Manual token';
    const baseText = getManualTokenBaseText(link, variableName);
    const textKeyframes = normalizeManualTokenTextKeyframes(link.manualTokenTextKeyframes);
    const originNodeId = invert ? link.toId : link.fromId;
    const destinationNodeId = invert ? link.fromId : link.toId;
    const arrivalAtNode = {};
    if (originNodeId) arrivalAtNode[originNodeId] = start;
    if (destinationNodeId) arrivalAtNode[destinationNodeId] = start + duration;
    const monitorEvents = textKeyframes.length > 0
      ? textKeyframes.map(keyframe => ({
          id: keyframe.id,
          at: keyframe.time,
          value: keyframe.text,
        }))
      : [{
          id: 'destination-arrival',
          at: start + duration,
          value: baseText,
        }];

    timingById[link.id] = {
      start,
      duration,
      invert,
      sourceNodeId: getManualTokenTrackId(link.id),
      variableName,
      variableValue: baseText,
      displayText: baseText,
      baseText,
      textKeyframes,
      textMaxLength: link.manualTokenMessageOverlap === false ? 24 : 6,
      originNodeId,
      destinationNodeId,
      arrivalAtNode,
      monitorEvents,
    };
  }

  return timingById;
}
