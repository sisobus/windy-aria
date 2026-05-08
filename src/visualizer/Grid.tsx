/**
 * 2D grid view of a windy-lang program.
 *
 * Renders the source as a monospace cell grid (each character in its
 * own <span>) and paints the cell under each live IP with that IP's
 * color. The grid mirrors the editor textarea above it — same font,
 * same column alignment — so the highlight visibly tracks the IP as
 * it walks the source.
 *
 * When `ips` is empty, the grid is just a static, read-only mirror
 * of the source.
 */

import type { IpState } from '../interpreter/windy.ts';
import { ipColor } from './colors.ts';

interface GridProps {
  source: string;
  ips: IpState[];
}

export function Grid({ source, ips }: GridProps) {
  const lines = source.length === 0 ? [''] : source.split('\n');
  const width = Math.max(1, ...lines.map((line) => [...line].length));

  // (x, y) → list of IPs sharing that cell, in birth order.
  const occupants = new Map<string, IpState[]>();
  for (const ip of ips) {
    const key = `${ip.x},${ip.y}`;
    const arr = occupants.get(key);
    if (arr) arr.push(ip);
    else occupants.set(key, [ip]);
  }

  return (
    <div className="visualizer" role="img" aria-label="windy-lang execution grid">
      {lines.map((line, y) => {
        const chars = [...line];
        return (
          <div key={y} className="vis-row">
            {Array.from({ length: width }, (_, x) => {
              const ch = chars[x] ?? ' ';
              const here = occupants.get(`${x},${y}`);
              if (!here || here.length === 0) {
                return (
                  <span key={x} className="vis-cell">
                    {ch === ' ' ? ' ' : ch}
                  </span>
                );
              }
              const style = backgroundFor(here);
              const ids = here.map((ip) => ip.id).join(',');
              return (
                <span
                  key={x}
                  className="vis-cell active"
                  style={style}
                  title={`IP ${ids}`}
                >
                  {ch === ' ' ? ' ' : ch}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Build a CSS background for a cell shared by one or more IPs.
 * One IP → solid color. Two-or-more → equal-stripe linear-gradient,
 * so collisions read as a banded cell.
 */
function backgroundFor(ips: IpState[]): React.CSSProperties {
  if (ips.length === 1) {
    return { background: ipColor(ips[0]!.id) };
  }
  const stops = ips.map((ip, i) => {
    const start = (i / ips.length) * 100;
    const end = ((i + 1) / ips.length) * 100;
    return `${ipColor(ip.id)} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  return { background: `linear-gradient(135deg, ${stops.join(', ')})` };
}
