import 'reflect-metadata'

import * as entities from './entity'
import { balances } from './balances'
import { hideBin } from 'yargs/helpers'
import { seed } from './seed'
import { sync } from './sync'
import { syncFull } from './sync-full'
import { trace } from './trace'

import { DataSource, DataSourceOptions } from 'typeorm'
import { config } from 'dotenv'
import yargs from 'yargs'

config()

const opt: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'trace2',
  synchronize: false,
  logging: false,
  entities: Object.values(entities),
  migrations: [],
  subscribers: [],
}

const run = (name: string, fn: (dataSource: DataSource) => Promise<any>) => async () => {
  console.log(`Running ${name}...`)

  const AppDataSource = new DataSource(opt)

  const dataSource = await AppDataSource.initialize()

  console.log('Connected')

  await fn(dataSource)

  console.log('Completed')

  await dataSource.destroy()
}

const schema = async () => {
  const AppDataSource = new DataSource({ ...opt, synchronize: true, logging: true })
  const dataSource = await AppDataSource.initialize()
  await dataSource.destroy()
}

yargs(hideBin(process.argv))
  .strict()
  .command('sync', 'sync events', run('sync', sync))
  .command('sync-full', 'sync full events', run('sync-full', syncFull))
  .command('seed', 'seed db', run('seed', seed))
  .command('schema', 'update db schema', schema)
  .command('balances', 'sync account balances', run('balances', balances))
  .command('trace', 'sync account trace', run('trace', trace))
  .help('h')
  .demandCommand(1, 'require command').argv as any
