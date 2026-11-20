// PROTOTYPE, throwaway (`src/render/prototype-look.ts`): builds `src/prototype-artifact.ts` into one script per look
// for the comparison page. Usage: VITE_LOOK=facet npx vite build -c scripts/prototype-artifact.vite.mjs
// (or VITE_LOOK=current). Writes scripts/visual/out/facet-prototype/bundle/tile-<look>.js, as `ClearwayTile_<look>`.
import { fileURLToPath } from 'node:url'

const look = process.env.VITE_LOOK
const root = fileURLToPath(new URL('..', import.meta.url))
export default {
  root,
  publicDir: false,
  build: {
    outDir: `${root}scripts/visual/out/facet-prototype/bundle`,
    emptyOutDir: false,
    lib: { entry: 'src/prototype-artifact.ts', formats: ['iife'], name: `ClearwayTile_${look}`, fileName: () => `tile-${look}.js` },
  },
}
