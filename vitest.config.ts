import { configDefaults, defineConfig } from 'vitest/config'

// `.claude/worktrees/` holds other branches' copies of the tests: git ignores the folder, and vitest must too.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '.claude/**'] } })
