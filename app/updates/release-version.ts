import { releaseLabel } from './release-identity.ts'

// This build's Release Version as people see it, such as v2026.11-r3; null outside release builds.
export const RELEASE_LABEL = __TIKKUN_RELEASE_VERSION__ ? releaseLabel(__TIKKUN_RELEASE_VERSION__) : null
