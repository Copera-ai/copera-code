import { describe, expect, it } from 'vitest'
import { excludedTarballEntries } from './verify-pack.ts'

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
