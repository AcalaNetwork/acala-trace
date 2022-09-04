/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Block, Call, FullEvent } from './entity'
import { DataSource } from 'typeorm'
import { endBlock, startBlock } from './config'
import { processCall } from './helper'
import { queryFullEvents } from './query'

export const syncFull = async (dataSource: DataSource) => {
  const evt = await FullEvent.find({ relations: { block: true }, order: { block: { height: 'DESC' } }, take: 1 })
  const currentHeight = evt[0] ? evt[0].block.height : startBlock

  await syncEvents(dataSource, currentHeight + 1, endBlock)
}

const syncEvents = async (dataSource: DataSource, fromBlock: number, toBlock: number): Promise<any> => {
  if (fromBlock >= toBlock) {
    return
  }
  const maxBlocks = 100
  const endBlock = Math.min(fromBlock + maxBlocks, toBlock)

  console.log(`Syncing full events from block ${fromBlock} to ${endBlock}`)

  const res = await queryFullEvents(fromBlock, endBlock)

  await dataSource.transaction(async (manager) => {
    await manager
      .createQueryBuilder()
      .insert()
      .orIgnore()
      .into(Block)
      .values(
        res.map((x) => ({
          hash: x.blockHash,
          height: x.height,
        }))
      )
      .execute()

    const calls = {} as any
    for (const x of res) {
      if (x.call) {
        const cs = processCall({
          id: x.call.id,
          name: x.call.name,
          args: x.call.args,
          extrinsicHash: x.extrinsicHash,
          success: x.call.success,
        })
        for (const c of cs) {
          calls[c.id] = c
        }
      }
    }
    await manager
      .createQueryBuilder()
      .insert()
      .orUpdate(['name', 'args', 'success'], 'PK_2098af0169792a34f9cfdd39c47')
      .into(Call)
      .values(Object.values(calls))
      .execute()

    const addEvent = async (events: typeof res) => {
      await manager
        .createQueryBuilder()
        .insert()
        .orIgnore()
        .into(FullEvent)
        .values(
          events.map((x) => ({
            id: x.id,
            blockHash: x.blockHash,
            extrinsicHash: x.extrinsicHash,
            callId: x.call ? x.call.id : null,
            name: x.event,
            args: x.args,
          }))
        )
        .execute()
    }

    if (res.length > 500) {
      const arr1 = res.splice(0, res.length / 2)
      await addEvent(arr1)
      await addEvent(res)
    } else {
      await addEvent(res)
    }
  })

  if (endBlock < toBlock) {
    return syncEvents(dataSource, endBlock, toBlock)
  }
}
