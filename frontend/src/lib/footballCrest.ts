/**
 * API-Sports team PNGs are not a consistent canvas.
 * Barcelona is ~150×150 and fills the square; Valencia is 240×150 with the
 * badge in the middle. `contain` in a square box then shrinks Valencia to
 * the wide canvas, so the crest looks tiny.
 *
 * Wide canvases use `cover` (crest stays inside the crop). Tall/square
 * canvases stay `contain` so liver birds / cockerels are not clipped.
 */
export function crestContentFit(
  width: number,
  height: number,
): 'contain' | 'cover' {
  if (!(width > 0) || !(height > 0)) return 'contain';
  return width / height > 1.2 ? 'cover' : 'contain';
}
