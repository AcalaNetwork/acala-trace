/* eslint-disable @typescript-eslint/no-unsafe-return */
import { AccountTrace, Block, Call, Event, LoanEvent, Trace, TransferEvent } from './entity'
import { Between, DataSource } from 'typeorm'
import { debitExchangeRate, endBlock, startBlock, systemAddresses } from './config'
import { processCall } from './helper'
import { queryEvents, queryLoansEvents } from './query'

export const sync = async (dataSource: DataSource) => {
  const evt = await Event.find({ relations: { block: true }, order: { block: { height: 'DESC' } }, take: 1 })
  const currentHeight = evt[0] ? evt[0].block.height : startBlock

  await syncEvents(dataSource, currentHeight + 1, endBlock)
  await syncLoanEvents(dataSource, currentHeight + 1, endBlock)
  await syncTraces(dataSource, currentHeight + 1, endBlock)
  await syncLoanTraces(dataSource, currentHeight + 1, endBlock)
}

const syncEvents = async (dataSource: DataSource, fromBlock: number, toBlock: number): Promise<any> => {
  if (fromBlock >= toBlock) {
    return
  }
  const maxBlocks = 100
  const endBlock = Math.min(fromBlock + maxBlocks, toBlock)

  console.log(`Syncing token events from block ${fromBlock} to ${endBlock}`)

  const res = (await queryEvents(fromBlock, endBlock)).filter((x) => {
    switch (x.event) {
      case 'Tokens.DustLost':
      case 'Tokens.Endowed':
      case 'Balances.Endowed':
      case 'Balances.Reserved':
      case 'Balances.Unreserved':
        // ignore those events
        return false
    }
    return true
  })

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

    await manager
      .createQueryBuilder()
      .insert()
      .orIgnore()
      .into(Event)
      .values(
        res.map((x) => ({
          id: x.id,
          blockHash: x.blockHash,
          extrinsicHash: x.extrinsicHash,
          callId: x.call ? x.call.id : null,
          name: x.event,
          currencyId: x.currencyId,
        }))
      )
      .execute()

    await manager
      .createQueryBuilder()
      .insert()
      .orIgnore()
      .into(TransferEvent)
      .values(
        res.map((x) => ({
          id: x.id,
          amount: x.amount,
          from: x.from,
          to: x.to,
          who: x.who,
        }))
      )
      .execute()
  })

  if (endBlock < toBlock) {
    return syncEvents(dataSource, endBlock, toBlock)
  }
}

const syncLoanEvents = async (dataSource: DataSource, fromBlock: number, toBlock: number): Promise<any> => {
  if (fromBlock >= toBlock) {
    return
  }
  const maxBlocks = 500
  const endBlock = Math.min(fromBlock + maxBlocks, toBlock)

  console.log(`Syncing loan events from block ${fromBlock} to ${endBlock}`)

  const res = await queryLoansEvents(fromBlock, endBlock)

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

    await manager
      .createQueryBuilder()
      .insert()
      .orIgnore()
      .into(Event)
      .values(
        res.map((x) => ({
          id: x.id,
          blockHash: x.blockHash,
          extrinsicHash: x.extrinsicHash,
          callId: x.call ? x.call.id : null,
          name: x.event,
          currencyId: x.currencyId,
        }))
      )
      .execute()

    await manager
      .createQueryBuilder()
      .insert()
      .orIgnore()
      .into(LoanEvent)
      .values(
        res.map((x) => ({
          id: x.id,
          who: x.who,
          collateralAmount: x.collateralAmount,
          debitAmount: x.debitAmount,
        }))
      )
      .execute()
  })

  if (endBlock < toBlock) {
    return syncLoanEvents(dataSource, endBlock, toBlock)
  }
}

const getCategory = (evt: Event) => {
  if (evt.extrinsicHash == null) {
    return 'system'
  }
  if (!evt.call || evt.call.success === false) {
    return 'fee'
  }

  switch (evt.call && evt.call.name) {
    case 'Honzon.adjust_loan':
    case 'Honzon.adjust_loan_by_debit_value':
      return 'loan'

    case 'Incentives.deposit_dex_share':
    case 'Incentives.withdraw_dex_share':
      return 'lp-staking'

    case 'Balances.transfer_all':
    case 'Balances.transfer_keep_alive':
    case 'Balances.transfer':
    case 'Currencies.transfer_native_currency':
    case 'Currencies.transfer':
      return 'transfer'

    case 'XTokens.transfer':
      return 'xcm-out'

    case 'ParachainSystem.set_validation_data':
      return 'xcm-in'

    case 'Dex.add_liquidity':
    case 'Dex.remove_liquidity':
    case 'Dex.claim_dex_share':
      return 'swap-liquidity'

    case 'StableAsset.mint':
    case 'StableAsset.redeem_proportion':
    case 'StableAsset.redeem_single':
      return 'stable-swap-liquidity'

    case 'AggregatedDex.swap_with_exact_supply':
    case 'Dex.swap_with_exact_supply':
    case 'Dex.swap_with_exact_target':
    case 'Honzon.close_loan_has_debit_by_dex':
      return 'swap'

    case 'StableAsset.swap':
      return 'stable-swap'

    case 'EVM.eth_call':
    case 'EVM.call':
      return 'evm'

    case 'Incentives.claim_rewards':
      return 'claim'

    case 'Homa.claim_redemption':
    case 'Homa.fast_match_redeems_completely':
    case 'Homa.mint':
    case 'Homa.request_redeem':
    case 'Homa.fast_match_redeems':
      return 'homa'

    case 'Multisig.as_multi':
    case 'Utility.batch_all':
    case 'Utility.batch':
      return 'nested'

    case 'CdpEngine.liquidate':
    case 'Dex.end_provisioning':
    case 'EvmAccounts.claim_account':
    case 'Multisig.cancel_as_multi':
    case 'NFT.transfer':
    case 'Proxy.announce':
    case 'Multisig.approve_as_multi':
    case 'FinancialCouncil.close':
    case 'FinancialCouncil.propose':
    case 'FinancialCouncil.vote':
    case 'GeneralCouncil.close':
    case 'GeneralCouncil.propose':
    case 'GeneralCouncil.vote':
    case 'ParachainSystem.enact_authorized_upgrade':
    case 'TechnicalCommittee.close':
    case 'TechnicalCommittee.propose':
    case 'TechnicalCommittee.vote':
    case 'Vesting.claim_for':
    case 'Vesting.claim':
    case 'Vesting.vested_transfer':
    case 'Democracy.note_preimage':
    case 'Democracy.propose':
    case 'Democracy.remove_vote':
    case 'Democracy.second':
    case 'Democracy.unlock':
    case 'Democracy.vote':
    case 'AcalaOracle.feed_values':
      return 'ignored'

    case null:
    case undefined:
      return 'fee'
    default:
      console.log(`Unknown call ${evt.call.name}`)
      return 'unknown'
  }
}

const syncTraces = async (dataSource: DataSource, fromBlock: number, toBlock: number): Promise<any> => {
  if (fromBlock >= toBlock) {
    return
  }
  const maxBlocks = 200
  const endBlock = Math.min(fromBlock + maxBlocks, toBlock)

  console.log(`Syncing traces from block ${fromBlock} to ${endBlock}`)

  await dataSource.transaction(async (manager) => {
    const events = await TransferEvent.find({
      where: {
        event: {
          block: { height: Between(fromBlock, endBlock - 1) },
        },
      },
      relations: {
        event: {
          block: true,
          call: true,
        },
      },
    })

    const traces = []
    const accountTraces = []

    for (const evt of events) {
      let from: string | undefined = evt.from
      let to: string | undefined = evt.to

      switch (evt.event.name) {
        case 'Tokens.Withdrawn':
        case 'Balances.Withdraw':
        case 'Balances.DustLost':
          from = evt.who
          to = undefined
          break
        case 'Tokens.Deposited':
        case 'Balances.Deposit':
          from = undefined
          to = evt.who
          break
        case 'Tokens.Transfer':
        case 'Balances.Transfer':
        case 'Balances.ReserveRepatriated':
          // do nothing
          break
        default:
          console.log(`Unknown event ${evt.event.name}`)
          break
      }

      const category = getCategory(evt.event)
      traces.push({
        id: evt.id,
        eventId: evt.id,
        currencyId: evt.event.currencyId,
        amount: evt.amount,
        category,
        from,
        to,
      })

      if (from) {
        accountTraces.push({
          account: from,
          traceId: evt.id,
        })
      }
      if (to) {
        accountTraces.push({
          account: to,
          traceId: evt.id,
        })
      }
    }

    await manager
      .createQueryBuilder()
      .insert()
      .orUpdate(['category'], 'PK_d55e3146ed1a9769069a83a8044')
      .into(Trace)
      .values(traces)
      .execute()

    await manager.createQueryBuilder().insert().orIgnore().into(AccountTrace).values(accountTraces).execute()
  })

  if (endBlock < toBlock) {
    return syncTraces(dataSource, endBlock, toBlock)
  }
}

const syncLoanTraces = async (dataSource: DataSource, fromBlock: number, toBlock: number): Promise<any> => {
  if (fromBlock >= toBlock) {
    return
  }
  const maxBlocks = 300
  const endBlock = Math.min(fromBlock + maxBlocks, toBlock)

  console.log(`Syncing loan traces from block ${fromBlock} to ${endBlock}`)

  await dataSource.transaction(async (manager) => {
    const events = await LoanEvent.find({
      where: {
        event: { block: { height: Between(fromBlock, endBlock - 1) } },
      },
      relations: {
        event: {
          block: true,
          call: true,
        },
      },
    })

    const traces = []

    for (const evt of events) {
      let from = systemAddresses.loans
      let to = evt.who

      let collateralAmount = BigInt(evt.collateralAmount)

      if (collateralAmount < 0n) {
        collateralAmount = -collateralAmount
        ;[from, to] = [to, from]
      }

      let category = 'loan'
      if (evt.event.call?.name === 'Honzon.close_loan_has_debit_by_dex') {
        category = 'swap'
      }

      if (collateralAmount !== 0n) {
        traces.push({
          id: evt.id,
          eventId: evt.id,
          currencyId: evt.event.currencyId,
          amount: collateralAmount.toString(),
          category,
          from,
          to,
        })
      }

      from = evt.who
      to = systemAddresses.loans

      let debitAmount = Math.floor(Number(evt.debitAmount) * (debitExchangeRate[evt.event.currencyId] || 0))

      if (debitAmount < 0n) {
        debitAmount = -debitAmount
        ;[from, to] = [to, from]
      }

      if (debitAmount !== 0) {
        const id = evt.id + '-debit'

        traces.push({
          id,
          eventId: evt.id,
          currencyId: '{"Token":"AUSD"}',
          amount: debitAmount.toString(),
          category,
          from,
          to,
        })
      }
    }

    await manager
      .createQueryBuilder()
      .insert()
      .orUpdate(['category'], 'PK_d55e3146ed1a9769069a83a8044')
      .into(Trace)
      .values(traces)
      .execute()
  })

  if (endBlock < toBlock) {
    return syncLoanTraces(dataSource, endBlock, toBlock)
  }
}
