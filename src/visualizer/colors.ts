/**
 * Color palette for live IPs, indexed by birth-order id.
 *
 * IP 0 (primary, the one currently sonified) is sky blue to match the
 * brand accent. The rest cycle through high-contrast hues that stay
 * readable on the dark background AND under light-color-scheme browsers
 * (each color is mid-luminance with a saturation high enough to read
 * over both #0a0e1a and #f5f5f5).
 */
const IP_COLORS = [
  '#7dd3fc', // sky — primary IP
  '#fcd34d', // amber
  '#c4b5fd', // violet
  '#86efac', // mint
  '#fda4af', // rose
  '#fdba74', // orange
  '#a5b4fc', // indigo
  '#67e8f9', // cyan
];

export function ipColor(id: number): string {
  return IP_COLORS[id % IP_COLORS.length]!;
}
