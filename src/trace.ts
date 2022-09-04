/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Between, DataSource } from 'typeorm'
import { Trace, TracingAccountBalance, TracingAccountTrace } from './entity'
import { endBlock, exitAddresses, pausedBlock, startBlock, systemAddresses } from './config'

export const trace = async (dataSource: DataSource) => {
  await syncTrace(dataSource, startBlock, endBlock)
}

const syncTrace = async (dataSource: DataSource, fromBlock: number, toBlock: number): Promise<any> => {
  if (fromBlock >= toBlock) {
    return
  }
  const maxBlocks = 100
  const endBlock = Math.min(fromBlock + maxBlocks, toBlock)

  console.log(`Tracing events from block ${fromBlock} to ${endBlock}`)

  await dataSource.transaction(async (manager) => {
    const repoTracingAccountBalance = manager.getRepository(TracingAccountBalance)
    const repoTracingAccountTrace = manager.getRepository(TracingAccountTrace)

    const isExitAddress = (addr: string) => {
      return exitAddresses.includes(addr)
    }

    const traces = await manager.getRepository(Trace).find({
      where: {
        event: {
          block: { height: Between(fromBlock + 1, endBlock) },
        },
      },
      relations: {
        event: {
          block: true,
          call: true,
        },
      },
    })

    for (const t of traces) {
      switch (t.category) {
        case 'homa':
        case 'lp-staking':
        case 'loan':
        case 'fee':
          continue
      }

      if (t.event.block.height > pausedBlock) {
        if (t.category === 'stable-swap' || t.category === 'stable-swap-liquidity') {
          // ignore stable swap related event after paused block
          continue
        }
      }

      if (t.currencyId === '{"Token":"ACA"}' && BigInt(t.amount) < BigInt(1e12)) {
        // ignore small transfer
        continue
      }

      let from = t.from
      let createTrace = false

      if (t.event.call?.name === 'Dex.add_liquidity' && t.event.name === 'Tokens.Deposited') {
        from = systemAddresses.dex
      }

      if (from) {
        const fromAcc = await repoTracingAccountBalance.findOneBy({
          account: from,
        })
        if (fromAcc) {
          createTrace = true
          if (t.to && !isExitAddress(t.to)) {
            const fromAcc2 =
              (await repoTracingAccountBalance.findOneBy({
                account: from,
                currencyId: t.currencyId,
              })) ||
              TracingAccountBalance.create({
                account: from,
                currencyId: t.currencyId,
                height: t.event.block.height,
              })
            fromAcc2.amount = (BigInt(fromAcc2.amount || 0) - BigInt(t.amount)).toString()
            await repoTracingAccountBalance.save(fromAcc2)

            await repoTracingAccountTrace.save(
              TracingAccountTrace.create({
                account: from,
                traceId: t.id,
              })
            )
          }
        }

        if (t.category === 'claim' && t.currencyId === '{"Token":"AUSD"}' && BigInt(t.amount) > BigInt(1e12)) {
          createTrace = true
        }
      }

      if (createTrace && t.to && !isExitAddress(t.to)) {
        if (t.to !== systemAddresses.cdp) {
          const toAcc =
            (await repoTracingAccountBalance.findOneBy({
              account: t.to,
              currencyId: t.currencyId,
            })) ||
            TracingAccountBalance.create({
              account: t.to,
              currencyId: t.currencyId,
              height: t.event.block.height,
            })
          toAcc.amount = (BigInt(toAcc.amount || 0) + BigInt(t.amount)).toString()
          await repoTracingAccountBalance.save(toAcc)
        }

        await repoTracingAccountTrace.save(
          TracingAccountTrace.create({
            account: t.to,
            traceId: t.id,
          })
        )
      }
    }
  })

  if (endBlock < toBlock) {
    return syncTrace(dataSource, endBlock, toBlock)
  }
}
