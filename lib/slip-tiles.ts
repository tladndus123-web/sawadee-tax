// Long, narrow slips (convenience-store / thermal receipts). The API shrinks every image to about 1568 px on
// its long side, so a 1:4 slip sent whole ends up ~300 px wide and its print is unreadable. Such a photo is
// cut into overlapping pieces along its long side instead, each piece close to the API's own shape, and all
// pieces go to the AI in one request (top to bottom), like photographing a long receipt in several shots.

export type Tile = { left: number; top: number; width: number; height: number };

/** Long side ÷ short side above which a photo counts as a long slip */
export const SLIP_RATIO = 2;
/** Each piece is at most this many times as long as the slip is wide */
export const TILE_RATIO = 1.5;
/** Share of a piece repeated at the start of the next, so no printed line is cut in half */
export const TILE_OVERLAP = 0.12;
/** Pieces per photo at most (a longer slip gets longer pieces) */
export const MAX_TILES = 8;

export const isSlip = (width: number, height: number) =>
  Math.max(width, height) / Math.max(1, Math.min(width, height)) > SLIP_RATIO;

/** Where to cut a photo: the whole photo for normal documents, overlapping pieces for long slips. */
export function tileRects(width: number, height: number): Tile[] {
  if (!isSlip(width, height)) return [{ left: 0, top: 0, width, height }];
  const tall = height >= width;
  const short = tall ? width : height;
  const long = tall ? height : width;
  let size = Math.round(short * TILE_RATIO);
  // Too many pieces: make each longer so MAX_TILES of them (with their overlaps) still cover the slip
  const pieces = (s: number) => Math.ceil((long - s) / (s - Math.round(s * TILE_OVERLAP))) + 1;
  while (pieces(size) > MAX_TILES) size = Math.ceil(size * 1.1);
  size = Math.min(size, long);
  const step = size - Math.round(size * TILE_OVERLAP);
  const out: Tile[] = [];
  for (let start = 0; ; start += step) {
    const at = Math.min(start, long - size); // last piece ends exactly at the bottom
    out.push(tall ? { left: 0, top: at, width, height: size } : { left: at, top: 0, width: size, height });
    if (at + size >= long) break;
  }
  return out;
}
