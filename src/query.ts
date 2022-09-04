/* eslint-disable @typescript-eslint/no-unsafe-return */

import { encodeAddress } from '@polkadot/keyring'
import { gql, request } from 'graphql-request'

const url = 'https://acala.explorer.subsquid.io/graphql'
const ss58Prefix = 10

export const getLatestBlockHeight = async () => {
  const query = gql`
    query {
      blocks(limit: 1, orderBy: height_DESC) {
        height
      }
    }
  `

  const { blocks } = await request(url, query)

  return blocks[0].height as number
}

export const processValue = (obj: any): any => {
  if (obj == null) {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(processValue) as any
  }
  if (typeof obj === 'object') {
    const { value, __kind, ...other } = obj
    const entries = Object.entries(other)
    const rest = Object.fromEntries(entries.map(([key, value]) => [key, processValue(value)]))
    if ('value' in obj) {
      return { [__kind]: processValue(value), ...rest }
    }
    if ('__kind' in obj) {
      if (entries.length === 0) {
        return obj.__kind
      }
      return { [__kind]: rest }
    }
    return rest
  }
  return obj
}

export const queryEvents = async (fromBlock: number, toBlock: number) => {
  const query = gql`
    query q($fromBlock: Int, $toBlock: Int) {
      events(
        where: {
          block: { height_gte: $fromBlock, height_lt: $toBlock }
          call: { success_eq: true }
          AND: { name_startsWith: "Tokens", OR: { name_startsWith: "Balances" } }
        }
      ) {
        extrinsic {
          hash
        }
        block {
          height
          hash
        }
        call {
          id
          name
          args
          success
        }
        args
        name
        id
      }
    }
  `

  const query2 = gql`
    query q($fromBlock: Int, $toBlock: Int) {
      events(
        where: {
          block: { height_gte: $fromBlock, height_lt: $toBlock }
          call_isNull: true
          AND: { name_startsWith: "Tokens", OR: { name_startsWith: "Balances" } }
        }
      ) {
        extrinsic {
          hash
        }
        block {
          height
          hash
        }
        call {
          id
          name
          args
          success
        }
        args
        name
        id
      }
    }
  `

  const [res1, res2] = await Promise.all([
    request(url, query, { fromBlock, toBlock }),
    request(url, query2, { fromBlock, toBlock }),
  ])

  return [...res1.events, ...res2.events].map((x: any) => ({
    id: x.id,
    height: x.block.height,
    blockHash: x.block.hash,
    extrinsicHash: x.extrinsic?.hash,
    call: x.call && {
      id: x.call.id,
      name: x.call.name,
      args: processValue(x.call.args),
      success: x.call.success,
    },
    event: x.name,
    amount: x.args.amount,
    currencyId: JSON.stringify(x.args.currencyId ? processValue(x.args.currencyId) : { Token: 'ACA' }),
    from: x.args.from && encodeAddress(x.args.from, ss58Prefix),
    to: x.args.to && encodeAddress(x.args.to, ss58Prefix),
    who:
      (x.args.who && encodeAddress(x.args.who, ss58Prefix)) ||
      (x.args.account && encodeAddress(x.args.account, ss58Prefix)),
  }))
}

export const queryLoansEvents = async (fromBlock: number, toBlock: number) => {
  const query = gql`
    query q($fromBlock: Int, $toBlock: Int) {
      events(
        where: {
          block: { height_gte: $fromBlock, height_lt: $toBlock }
          call: { success_eq: true }
          name_eq: "Loans.PositionUpdated"
        }
      ) {
        extrinsic {
          hash
        }
        block {
          height
          hash
        }
        call {
          id
          name
          args
        }
        args
        name
        id
      }
    }
  `

  const query2 = gql`
    query q($fromBlock: Int, $toBlock: Int) {
      events(
        where: {
          block: { height_gte: $fromBlock, height_lt: $toBlock }
          call_isNull: true
          name_eq: "Loans.PositionUpdated"
        }
      ) {
        extrinsic {
          hash
        }
        block {
          height
          hash
        }
        call {
          id
          name
          args
        }
        args
        name
        id
      }
    }
  `

  const [res1, res2] = await Promise.all([
    request(url, query, { fromBlock, toBlock }),
    request(url, query2, { fromBlock, toBlock }),
  ])

  return [...res1.events, ...res2.events].map((x: any) => ({
    id: x.id,
    height: x.block.height,
    blockHash: x.block.hash,
    extrinsicHash: x.extrinsic?.hash,
    call: x.call && {
      id: x.call.id,
      name: x.call.name,
      args: processValue(x.call.args),
    },
    event: x.name,
    currencyId: JSON.stringify(processValue(x.args.collateralType)),
    collateralAmount: x.args.collateralAdjustment,
    debitAmount: x.args.debitAdjustment,
    who: encodeAddress(x.args.owner, ss58Prefix),
  }))
}

export const queryFullEvents = async (fromBlock: number, toBlock: number) => {
  const query = gql`
    query q($fromBlock: Int, $toBlock: Int) {
      events(where: { block: { height_gte: $fromBlock, height_lt: $toBlock } }) {
        extrinsic {
          hash
        }
        block {
          height
          hash
        }
        call {
          id
          name
          args
          success
        }
        args
        name
        id
      }
    }
  `
  const res = await request(url, query, { fromBlock, toBlock })

  return (res.events as any[]).map((x: any) => ({
    id: x.id,
    height: x.block.height,
    blockHash: x.block.hash,
    extrinsicHash: x.extrinsic?.hash,
    call: x.call && {
      id: x.call.id,
      name: x.call.name,
      args: processValue(x.call.args),
      success: x.call.success,
    },
    event: x.name,
    args: processValue(x.args),
  }))
}
