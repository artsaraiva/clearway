// The low-poly look (`.scratch/living-city/spec.md`), behind a dev switch until it is the game's one look (#281).
// One switch, read once: the shared materials and shapes ask it, so every Zone takes the look at once (#276).

const asked =
  typeof location === 'undefined'
    ? // No page: the scene check and the tests, which take it from the environment (`LOOK=lowpoly npm run check:scene`).
      (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.LOOK
    : import.meta.env.DEV
      ? new URLSearchParams(location.search).get('look')
      : null

/**
 * Dev only: `?look=lowpoly` draws the whole City low poly. Every face is flat-shaded, the kit's round shapes are
 * few-sided, rounded corners are cut, flat colour stands where the surface pattern was, and shadows are hard-edged.
 * What is built and where never changes with it.
 */
export const LOW_POLY: boolean = asked === 'lowpoly'
