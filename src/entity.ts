import { BaseEntity, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm'

@Entity()
export class Block extends BaseEntity {
  @PrimaryColumn()
  hash: string

  @Index()
  @Column()
  height: number

  @OneToMany(() => Event, (events) => events.block)
  events: Event[]
}

@Entity()
export class Call extends BaseEntity {
  @PrimaryColumn()
  id: string

  @Column()
  extrinsicHash: string

  @Index()
  @Column()
  name: string

  @OneToMany(() => Event, (events) => events.call)
  events: Event[]

  @Column('jsonb', { nullable: true })
  args: any

  @Column({ nullable: true })
  success: boolean
}

@Entity()
export class Currency extends BaseEntity {
  @PrimaryColumn()
  id: string

  @Column()
  name: string

  @Column()
  decimals: number

  @Column('double precision')
  price: number
}

@Entity()
export class Event extends BaseEntity {
  @PrimaryColumn()
  id: string

  @ManyToOne(() => Block, (block) => block.events)
  block: Block

  @Column()
  blockHash: string

  @Column({ nullable: true })
  extrinsicHash: string

  @ManyToOne(() => Call, (call) => call.events, { nullable: true })
  call: Call

  @Column({ nullable: true })
  callId: string

  @Index()
  @Column()
  name: string

  @ManyToOne(() => Currency)
  @JoinColumn()
  currency: Currency

  @Column()
  currencyId: string
}

@Entity()
export class FullEvent extends BaseEntity {
  @PrimaryColumn()
  id: string

  @ManyToOne(() => Block, (block) => block.events)
  block: Block

  @Column()
  blockHash: string

  @Column({ nullable: true })
  extrinsicHash: string

  @ManyToOne(() => Call, (call) => call.events, { nullable: true })
  call: Call

  @Column({ nullable: true })
  callId: string

  @Index()
  @Column()
  name: string

  @Column('jsonb', { nullable: true })
  args: any
}

@Entity()
export class TransferEvent extends BaseEntity {
  @PrimaryColumn()
  id: string // event id

  @ManyToOne(() => Event)
  @JoinColumn({ name: 'id' })
  event: Event

  @Column('decimal')
  amount: string

  @Column({ nullable: true })
  from: string

  @Column({ nullable: true })
  to: string

  @Column({ nullable: true })
  who: string
}

@Entity()
export class LoanEvent extends BaseEntity {
  @PrimaryColumn()
  id: string // event id

  @ManyToOne(() => Event)
  @JoinColumn({ name: 'id' })
  event: Event

  @Column({ nullable: true })
  who: string

  @Column('decimal')
  collateralAmount: string

  @Column('decimal')
  debitAmount: string
}

@Entity()
export class Account extends BaseEntity {
  @PrimaryColumn()
  address: string

  @Column({ nullable: true })
  tag: string

  @Column('jsonb', { nullable: true })
  props: {
    system: boolean
    exit: boolean
    parachain: boolean
    traced: boolean
    cex: boolean
  }
}

@Entity()
export class AccountBalance extends BaseEntity {
  @PrimaryColumn()
  account: string

  @ManyToOne(() => Block)
  @JoinColumn()
  block: Block

  @PrimaryColumn()
  blockHash: string

  @ManyToOne(() => Currency)
  @JoinColumn()
  currency: Currency

  @PrimaryColumn()
  currencyId: string

  @PrimaryColumn({ default: '' })
  tag: string

  @Column('decimal')
  balance: string
}

@Entity()
export class Trace extends BaseEntity {
  @PrimaryColumn()
  id: string

  @ManyToOne(() => Event)
  @JoinColumn()
  event: Event

  @Index()
  @Column()
  eventId: string

  @Index()
  @Column()
  category: string

  @ManyToOne(() => Currency)
  @JoinColumn()
  currency: Currency

  @Index()
  @Column()
  currencyId: string

  @Column('decimal')
  amount: string

  @Column({ nullable: true })
  from: string

  @Column({ nullable: true })
  to: string
}

@Entity()
export class AccountTrace extends BaseEntity {
  @PrimaryColumn()
  account: string

  @ManyToOne(() => Trace, { primary: true } as any)
  @JoinColumn()
  trace: Trace

  @PrimaryColumn()
  traceId: string
}

@Entity()
export class TracingAccountBalance extends BaseEntity {
  @PrimaryColumn()
  account: string

  @PrimaryColumn()
  currencyId: string

  @Column('decimal')
  amount: string

  @Column()
  height: number
}

@Entity()
export class TracingAccountTrace extends BaseEntity {
  @PrimaryColumn()
  account: string

  @PrimaryColumn()
  traceId: string
}
