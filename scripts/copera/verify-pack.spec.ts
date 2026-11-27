import { describe, expect, it } from 'vitest'
import { excludedTarballEntries, sourceMapsWithLocalPaths, strayTarballEntries } from './verify-pack.ts'

describe('excludedTarballEntries', () => {
  it('finds excluded packages at any depth and ignores allowed ones', () => {
    expect(excludedTarballEntries([
      'package/package.json',
      'package/node_modules/openai/index.js',
      'package/node_modules/@anthropic-ai/sdk/index.js',
      'package/node_modules/@anthropic-ai/sdk/package.json',
      'package/node_modules/a/node_modules/@openai/codex/bin.js',
      'package/node_modules/@deepseek-ai/dsh-timeline/package.json',
      'package/node_modules/@deepseek-ai/dsh-web-app/package.json',
    ])).toEqual([
      'package/node_modules/@anthropic-ai/sdk',
      'package/node_modules/@deepseek-ai/dsh-timeline',
      'package/node_modules/a/node_modules/@openai/codex',
    ])
  })
})

describe('strayTarballEntries', () => {
  it('finds env files, nested tarballs, and first-party tests, and ignores third-party test directories', () => {
    expect(strayTarballEntries([
      'package/package.json',
      'package/.env',
      'package/node_modules/@deepseek-ai/dsh-llm/.env.local',
      'package/node_modules/@deepseek-ai/dsh-llm/tests/llm.spec.ts',
      'package/node_modules/@deepseek-ai/dsh-llm/src/index.ts',
      'package/node_modules/@deepseek-ai/dsh-llm/lib/index.test.js',
      'package/node_modules/left-pad/test/index.js',
      'package/node_modules/left-pad/left-pad-1.0.0.tgz',
      'package/tests/smoke.js',
    ])).toEqual([
      'package/.env',
      'package/node_modules/@deepseek-ai/dsh-llm/.env.local',
      'package/node_modules/@deepseek-ai/dsh-llm/lib/index.test.js',
      'package/node_modules/@deepseek-ai/dsh-llm/tests/llm.spec.ts',
      'package/node_modules/left-pad/left-pad-1.0.0.tgz',
      'package/tests/smoke.js',
    ])
  })
})

describe('sourceMapsWithLocalPaths', () => {
  it('finds maps that name a build-machine directory', () => {
    expect(sourceMapsWithLocalPaths([
      { path: 'a.js.map', text: '{"sources":["../src/a.ts"]}' },
      { path: 'b.js.map', text: '{"sources":["/home/builder/checkout/src/b.ts"]}' },
    ], ['/home/builder/checkout', ''])).toEqual(['b.js.map'])
  })
})
