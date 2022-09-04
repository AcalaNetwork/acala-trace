import { Account, Currency } from './entity'
import { cexAddresses, exitAddresses, parachainAddresses, systemAddresses, tokens } from './config'

export const seed = async () => {
  for (const [key, val] of Object.entries(tokens)) {
    const currency = Currency.create({
      id: key,
      name: val.name,
      decimals: val.decimals,
      price: val.price,
    })

    await currency.save()
  }

  for (const [key, val] of Object.entries(systemAddresses)) {
    await Account.create({
      address: val,
      tag: key,
    }).save()
  }

  for (const addr of exitAddresses) {
    const account = Account.create({ address: addr })

    account.props = account.props || {}
    account.props.exit = true

    await account.save()
  }

  for (const [name, addr] of Object.entries(parachainAddresses)) {
    const account = Account.create({ address: addr, tag: name })

    account.props = account.props || {}
    account.props.parachain = true
    account.props.exit = true

    await account.save()
  }

  for (const addr of cexAddresses) {
    const account = Account.create({ address: addr })

    account.props = account.props || {}
    account.props.cex = true
    account.props.exit = true

    await account.save()
  }
}
