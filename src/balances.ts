/* eslint-disable @typescript-eslint/restrict-template-expressions */
import '@acala-network/types'
import {
  AcalaPrimitivesCurrencyCurrencyId,
  AcalaPrimitivesTradingPair,
  FrameSystemAccountInfo,
} from '@acala-network/types/interfaces/types-lookup'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { DataSource } from 'typeorm'
import { FixedPointNumber } from '@acala-network/sdk-core'
import { fetchEntries, fetchEntriesToArray } from '@open-web3/util'
import { queue } from 'async'

import { AccountBalance, Block } from './entity'
import { endBlock, startBlock } from './config'

export const balances = async (dataSource: DataSource) => {
  const api = await ApiPromise.create({ provider: new WsProvider(process.env.WS_ENDPOINT) })

  await syncBalances(dataSource, startBlock, api)
  await syncBalances(dataSource, endBlock - 1, api)

  await api.disconnect()
}

const syncBalances = async (dataSource: DataSource, block: number, api: ApiPromise) => {
  console.log(`Sync block ${block} ...`)

  const blockHash = await api.rpc.chain.getBlockHash(block)
  console.log(block, blockHash.toHex())
  const apiAt = await api.at(blockHash)

  await Block.create({
    hash: blockHash.toHex(),
    height: block,
  }).save()

  const stableCurrency = api.consts.cdpEngine.getStableCurrencyId
  const nativeCurrency = apiAt.consts.currencies.getNativeCurrencyId
  const liquidCurrency = apiAt.consts.homa.liquidCurrencyId

  const collaterals = await Promise.all(
    (
      await apiAt.query.cdpEngine.collateralParams.keys()
    ).map(async (x) => {
      const currency = x.args[0]
      const rateValue = (await apiAt.query.cdpEngine.debitExchangeRate(currency)).unwrapOr(
        apiAt.consts.cdpEngine.defaultDebitExchangeRate
      )
      const rate = FixedPointNumber.fromInner(rateValue.toString(), 18)
      return {
        currency,
        rate,
      }
    })
  )

  const rewardPools = (await apiAt.query.rewards.poolInfos.entries()).map(([key, info]) => ({
    pool: key.args[0],
    info,
  }))

  const provisioningPools = (await apiAt.query.dex.provisioningPool.entries()).map(([key, data]) => ({
    pair: key.args[0],
    account: key.args[1],
    data: [(data as any)[0].toBigInt(), (data as any)[1].toBigInt()] as [bigint, bigint],
  }))

  const provisioningPoolsShareData = {} as Record<string, { pair: AcalaPrimitivesTradingPair; shareAmount: bigint }[]>

  const initialExchangeRate = (await apiAt.query.dex.initialShareExchangeRates.entries()).map(([key, data]) => ({
    pair: key.args[0],
    data: [(data as any)[0].toBigInt(), (data as any)[1].toBigInt()] as [bigint, bigint],
  }))

  const poolData = {} as Record<
    string,
    { pair: AcalaPrimitivesTradingPair; initalRate: [bigint, bigint]; totalShare: bigint }
  >

  for (const { pair, data } of initialExchangeRate) {
    poolData[pair.toString()] = {
      pair,
      initalRate: data,
      totalShare: 0n,
    }
  }

  for (const data of provisioningPools) {
    const acc = data.account.toString()

    const pool = poolData[data.pair.toString()]
    const shareAmount =
      (data.data[0] * pool.initalRate[0]) / 10n ** 18n + (data.data[1] * pool.initalRate[1]) / 10n ** 18n
    pool.totalShare += shareAmount

    provisioningPoolsShareData[acc] = provisioningPoolsShareData[acc] || []
    provisioningPoolsShareData[acc].push({
      pair: data.pair,
      shareAmount: shareAmount,
    })
  }

  let c = 0

  const syncData = async ({ address, accountInfo }: { address: string; accountInfo: FrameSystemAccountInfo }) => {
    const native = accountInfo.data.free.toBigInt() + accountInfo.data.reserved.toBigInt()
    const tokens = await fetchEntriesToArray((startKey) =>
      apiAt.query.tokens.accounts.entriesPaged({
        args: [address],
        pageSize: 100,
        startKey,
      })
    )

    const data: { token: string; free: bigint; tag?: string }[] = [
      { token: JSON.stringify(nativeCurrency), free: native },
    ]
    for (const [key, value] of tokens) {
      const currencyId = key.args[1] as AcalaPrimitivesCurrencyCurrencyId
      const token = currencyId
      const free = value.free.toBigInt()
      data.push({
        token: JSON.stringify(token),
        free,
      })
    }
    for (const { currency, rate } of collaterals) {
      const collateralToken = currency
      const pos = await apiAt.query.loans.positions(currency, address)
      const debit = FixedPointNumber.fromInner(pos.debit.toString(), 12).mul(rate)
      if (!pos.debit.eqn(0)) {
        data.push({
          token: JSON.stringify(stableCurrency),
          free: -BigInt(debit.toChainData()),
          tag: currency.toString(),
        })
      }

      data.push({
        token: JSON.stringify(collateralToken),
        free: pos.collateral.toBigInt(),
        tag: 'collateral',
      })
    }

    for (const pool of rewardPools) {
      if (pool.pool.isDex) {
        const reward = await apiAt.query.rewards.sharesAndWithdrawnRewards(pool.pool, address)
        const share = reward[0].toBigInt()
        const poolCurrencyId = pool.pool.asDex
        data.push({
          token: JSON.stringify(poolCurrencyId),
          free: share,
          tag: 'reward',
        })
      }
    }

    const shareData = provisioningPoolsShareData[address] || []
    for (const { pair, shareAmount } of shareData) {
      const lpToken = apiAt.registry.createType('AcalaPrimitivesCurrencyCurrencyId', {
        dexShare: [pair[0].toJSON(), pair[1].toJSON()],
      })
      data.push({
        token: JSON.stringify(lpToken),
        free: shareAmount,
        tag: 'swap-provisioning-pool',
      })
    }

    const redeemRequest = await apiAt.query.homa.redeemRequests(address)
    let homaValue = redeemRequest.unwrapOrDefault()[0].toBigInt()

    const unbondings = await apiAt.query.homa.unbondings.entries(address)
    for (const chunk of unbondings) {
      homaValue += chunk[1].toBigInt()
    }

    if (homaValue > 0n) {
      data.push({
        token: JSON.stringify(liquidCurrency),
        free: homaValue,
        tag: 'redeem',
      })
    }

    const data2 = data.filter((x) => x.free !== 0n)

    for (const x of data2) {
      await AccountBalance.upsert(
        {
          account: address,
          blockHash: blockHash.toHex(),
          currencyId: x.token
            .replaceAll('dex', 'Dex')
            .replaceAll('token', 'Token')
            .replaceAll('liquid', 'Liquid')
            .replaceAll('stable', 'Stable')
            .replaceAll('foreign', 'Foreign'),
          tag: x.tag,
          balance: x.free.toString(),
        },
        ['account', 'blockHash', 'currencyId', 'tag']
      )
    }

    process.stdout.write(`\r${++c}|${data2.length}   `)
  }

  const workerQueue = queue((x: { address: string; accountInfo: FrameSystemAccountInfo }, callback) => {
    syncData(x)
      .then(() => callback())
      .catch(callback)
  }, 50)

  const promises: Promise<any>[] = []

  await fetchEntries(
    (startKey) =>
      apiAt.query.system.account.entriesPaged({
        args: [],
        pageSize: 200,
        startKey,
      }),
    (key, accountInfo) => {
      const address = key.args[0].toString()
      promises.push(workerQueue.push({ address, accountInfo }))
    }
  )

  await Promise.all(promises)

  console.log(`Sync block ${block} complete`)
}
