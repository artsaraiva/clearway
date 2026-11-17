// Serves the game with Vite on a free port for the shot and bench scripts: the working tree, or the tree of any git ref.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'

export const ROOT = resolve(import.meta.dirname, '../..')

const servers = []
/** Close every server `serve` started. */
export const closeAll = () => Promise.all(servers.splice(0).map((s) => s.close()))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => closeAll().then(() => process.exit(130)))

/**
 * Serve the working tree, or `ref`'s tree when given. Each server gets its own dependency cache, so it never clashes
 * with a dev server already running, and watches no files, so editing `src/` during a run reloads no page.
 * ponytail: a ref is served with this checkout's `node_modules`, so a ref whose dependencies differ runs on the wrong
 * ones. Run `npm ci` in a `git worktree` of that ref and serve it from there if that ever matters.
 */
export async function serve(ref) {
  const tmp = mkdtempSync(join(tmpdir(), 'clearway-visual-'))
  let root = ROOT
  let label = 'working tree'
  if (ref) {
    const sha = execFileSync('git', ['rev-parse', '--short', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim()
    label = ref.startsWith(sha) || sha.startsWith(ref) ? sha : `${ref} (${sha})`
    root = join(tmp, 'tree')
    mkdirSync(root)
    // Only what Vite serves: the rest of the repo is mostly reference images.
    const tar = execFileSync('git', ['archive', sha, 'index.html', 'src', 'public'], { cwd: ROOT, maxBuffer: 1 << 30 })
    execFileSync('tar', ['-x', '-C', root], { input: tar })
    symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'))
  }
  const vite = await createServer({
    root,
    logLevel: 'error',
    cacheDir: join(tmp, 'vite'),
    server: { host: '127.0.0.1', port: 0, strictPort: true, watch: null, hmr: false },
  })
  await vite.listen()
  const server = {
    label,
    url: vite.resolvedUrls.local[0].replace(/\/$/, ''),
    /** The Zones the served tree has, in the bar's order. */
    zones: async () => (await vite.ssrLoadModule('/src/city/city.ts')).ZONES,
    close: async () => {
      await vite.close()
      rmSync(tmp, { recursive: true, force: true })
    },
  }
  servers.push(server)
  return server
}
