#!/usr/bin/env node
// The `copera-code` bin of the generated @copera.ai/code package; scripts/copera/pack-npm.ts copies it to bin/copera-code.mjs.
import { readFileSync } from 'node:fs'
import { runCoperaCode } from '@deepseek-ai/dsh-copera-launch'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
await runCoperaCode({ productVersion: version })
