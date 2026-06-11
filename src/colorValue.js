const HEX_COLOR = /^#([0-9a-f]{6})$/i;
const SHORT_HEX_COLOR = /^#([0-9a-f]{3})$/i;
const RGB_COLOR = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i;

function channelToHex(value) {
  const channel = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  return channel.toString(16).padStart(2, '0');
}

export function toColorInputValue(value, fallback = '#000000') {
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  if (HEX_COLOR.test(color)) return color.toLowerCase();

  const shortHex = color.match(SHORT_HEX_COLOR);
  if (shortHex) {
    return `#${[...shortHex[1]].map(char => char + char).join('')}`.toLowerCase();
  }

  const rgb = color.match(RGB_COLOR);
  if (rgb) {
    return `#${channelToHex(rgb[1])}${channelToHex(rgb[2])}${channelToHex(rgb[3])}`;
  }

  return HEX_COLOR.test(fallback) ? fallback.toLowerCase() : '#000000';
}
