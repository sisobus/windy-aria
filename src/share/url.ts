/**
 * URL hash permalink encoder/decoder for windy-aria.
 *
 * Format:  #s=<base64url(utf8(source))>&bpm=<n>
 *
 * Source uses the same encoding as the upstream windy playground
 * (web/main.js: `encodeSourceForHash`), so a permalink shared from
 * windy.sisobus.com opens cleanly here, and vice versa. We deliberately
 * skip CompressionStream/deflate to keep that compatibility — most
 * windy programs are <2 KB anyway and base64-of-utf8 stays well under
 * the 8 KB CloudFront / browser hash limit for any realistic source.
 *
 * BPM is a windy-aria-specific extension. windy ignores extra hash
 * params, so the cross-compat works one-way without needing a tag-
 * based key/value scheme.
 */

const PREFIX = '#s=';

/**
 * Encode `source` and (optionally) `bpm` into a URL fragment string,
 * including the leading `#`. Use as `location.hash = encodeShareHash(...)`
 * or as a query for clipboard share.
 *
 * `bpm` is only emitted when it differs from `defaultBpm` — keeps the
 * common case (user only edited the source) producing the simpler
 * windy-compatible `#s=...` shape.
 */
export function encodeShareHash(source: string, bpm: number, defaultBpm: number): string {
  const sourcePart = PREFIX + base64urlEncodeUtf8(source);
  if (bpm === defaultBpm) return sourcePart;
  return `${sourcePart}&bpm=${bpm}`;
}

export interface DecodedHash {
  source?: string;
  bpm?: number;
}

/**
 * Parse a hash like `#s=...&bpm=240` into its components. Returns an
 * empty object on missing/malformed hashes — the caller should fall
 * back to defaults rather than treat this as an error.
 */
export function decodeShareHash(hash: string): DecodedHash {
  if (!hash || !hash.startsWith('#')) return {};
  // Strip the leading `#` so we can use URLSearchParams-ish tokenizing.
  const body = hash.slice(1);
  const out: DecodedHash = {};
  for (const part of body.split('&')) {
    if (part.startsWith('s=')) {
      const decoded = tryDecodeBase64Url(part.slice(2));
      if (decoded != null) out.source = decoded;
    } else if (part.startsWith('bpm=')) {
      const n = parseInt(part.slice(4), 10);
      if (Number.isFinite(n) && n >= 1 && n <= 10000) out.bpm = n;
    }
  }
  return out;
}

function base64urlEncodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function tryDecodeBase64Url(payload: string): string | null {
  try {
    let b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
