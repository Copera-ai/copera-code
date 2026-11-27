import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { IndexInjection, WebServer } from '@deepseek-ai/dsh-host-webserver'
import * as HostPlugin from '../src/index.ts'

/** The Peer an index render speaks for; this listener reads no field of it. */
const PAGE_PEER = { principal: { kind: 'owner' } } as Parameters<WebServer['renderIndex']>[1]

function collect(ctx: Context): IndexInjection[] {
  const table: IndexInjection[] = []
  ctx.emit('webserver/index-inject', table, PAGE_PEER)
  return table
}

describe('Copera brand host half', () => {
  it('paints the dark boot canvas #050505 before the first frame and stops on dispose', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(HostPlugin)
    await fiber.await()
    const rows = collect(ctx)
    expect(rows).toHaveLength(1)
    const [row] = rows
    if (row?.kind !== 'style') throw new Error('expected one style row')
    expect(row.text).toContain('body[data-ds-dark-theme]')
    expect(row.text).toContain('background-color:#050505')
    expect(row.text).toContain('--dsh-boot-bg:#050505')
    expect(row.text).not.toContain('</style')
    await fiber.dispose()
    expect(collect(ctx)).toEqual([])
  })
})
