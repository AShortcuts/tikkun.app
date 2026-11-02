import base from './vitest.config.ts'

// Throwaway: gives each parallel WebKit shard its own browser server port.
const port = Number(process.env.WEBKIT_SHARD_PORT)
type Project = { test?: { name?: string; browser?: Record<string, unknown> } }
const projects = (base.test?.projects ?? []) as Project[]
export default {
  ...base,
  test: {
    ...base.test,
    projects: projects.map((project) => project.test?.name === 'webkit'
      ? { ...project, test: { ...project.test, browser: { ...project.test.browser, api: { port, strictPort: true } } } }
      : project),
  },
}
