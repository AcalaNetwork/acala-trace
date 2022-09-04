create or replace view trace_value as
select trace.id                                       as id,
       trace.amount / power(10, c.decimals)           as amount,
       trace.amount / power(10, c.decimals) * c.price as value,
       trace."currencyId"                             as "currencyId"
from trace
         join currency c on c.id = trace."currencyId"
;

create or replace view account_trace_value as
select account,
       "traceId",
       category,
       trace_value."currencyId",
       case when account = t."from" then -t.amount else t.amount end                     as amount,
       case when account = t."from" then -trace_value.amount else trace_value.amount end as value,
       full_event.name                                                                   as eventName,
       full_event.args                                                                   as eventArgs,
       c.name                                                                            as callName,
       c.args                                                                            as callArgs,
       full_event."extrinsicHash",
       b.height,
       c.success
from account_trace
         join trace t on t.id = account_trace."traceId"
         join trace_value on trace_value.id = t.id
         join full_event on full_event.id = t."eventId"
         join call c on full_event."callId" = c.id
         join block b on full_event."blockHash" = b.hash
;

create or replace view account_xcm_view as
select account
     , "currencyId"
     , sum("amount") as amount
from (select account
           , "currencyId"
           , amount
      from account_trace_value
      where ((category = 'xcm-in' and value > 0) or category = 'xcm-out' and value < 0)) atv
group by account, "currencyId"
;

create or replace view account_balance_diff as
select account
     , "currencyId"
     , tag
     , sum("amount")                     as amount
     , sum("amount") / pow(10, decimals) as value
from ((select "currencyId"
            , tag
            , -sum(balance) as amount
            , account
       from account_balance
                join block b on account_balance."blockHash" = b.hash
       where height = 1638215
       group by "currencyId"
              , account
              , tag)
      union all
      (select "currencyId"
            , tag
            , sum(balance)
            , account
       from account_balance
                join block b on account_balance."blockHash" = b.hash
       where height = 1694499
       group by "currencyId"
              , account
              , tag)) as t
         join currency c on c.id = t."currencyId"
group by account, "currencyId", tag, decimals
having sum(amount) <> 0
;

create or replace view account_balance_before as
select "currencyId"
     , tag
     , sum(balance)                       as sum
     , account
     , sum(balance) / pow(10, c.decimals) as value
from account_balance
         join block b on account_balance."blockHash" = b.hash
         join currency c on account_balance."currencyId" = c.id
where height = 1638215
group by "currencyId"
       , c.decimals
       , account
       , tag
;

create or replace view account_balance_after as
select "currencyId"
     , tag
     , sum(balance)                       as sum
     , account
     , sum(balance) / pow(10, c.decimals) as value
from account_balance
         join block b on account_balance."blockHash" = b.hash
         join currency c on account_balance."currencyId" = c.id
where height = 1694499
group by "currencyId"
       , c.decimals
       , account
       , tag
;

create or replace view account_cex_amount as
select account,
       "currencyId",
       sum(out_amount) - sum(in_amount) as amount,
       sum(in_amount)                   as in_amount,
       sum(out_amount)                  as out_amount
from (select "from" as account, "currencyId", amount as in_amount, 0 as out_amount
      from trace
      where "to" in (select address
                     from account
                     where (props ->> 'cex')::boolean)
      union all
      select "to", "currencyId", 0, amount as out_amount
      from trace
      where "from" in (select address
                       from account
                       where (props ->> 'cex')::boolean)) t
group by account, "currencyId"
;

create or replace view tracing_account_trace_with_details as
select account,
       category,
       c.name                                                                          as currency,
       case when account = t."from" then -amount else amount end                       as amount,
       case when account = t."from" then -amount else amount end / pow(10, c.decimals) as amount2,
       case
           when account = t."from" then -amount
           else amount end / pow(10, c.decimals) * c.price                             as value,
       b.height,
       c2.name                                                                         as call_name,
       "from",
       "to"
from tracing_account_trace
         join trace t on "traceId" = t.id
         join currency c on t."currencyId" = c.id
         join event e on t."eventId" = e.id
         join block b on b.hash = e."blockHash"
         join call c2 on e."callId" = c2.id
;

create materialized view account_trace_info as
select account
     , "currencyId"
     , tag
     , sum(before) as before
     , sum(after)  as after
     , sum(xcm)    as xcm
     , sum(homa)   as homa
     , sum(cex)    as cex
from (select account
           , "currencyId"
           , ''     as tag
           , 0      as before
           , 0      as after
           , amount as xcm
           , 0      as homa
           , 0      as cex
      from account_xcm_view
      union all
      (select account
            , "currencyId"
            , tag
            , sum(balance) as before
            , 0            as after
            , 0            as xcm
            , 0            as homa
            , 0            as cex
       from account_balance
       where "blockHash" = '0x67bd822cbc33b8c245aa7d42cafbf20d8adb924f62cd3b584fd55982473beb85'
       group by "currencyId"
              , tag
              , account)
      union all
      (select account
            , "currencyId"
            , tag
            , 0            as before
            , sum(balance) as after
            , 0            as xcm
            , 0            as homa
            , 0            as cex
       from account_balance
       where "blockHash" = '0x30af7c6ff262a0e640a14a92110906474c7fb071485ea94622f1aa7cbcc75193'
       group by "currencyId"
              , tag
              , account)
      union all
      select account
           , "currencyId"
           , ''          as tag
           , 0           as before
           , 0           as after
           , 0           as xcm
           , sum(amount) as homa
           , 0           as cex
      from account_trace_value
      where category = 'homa'
        and "currencyId" in ('{"Token":"DOT"}', '{"Token":"LDOT"}')
      group by account, "currencyId"
      union all
      select account
           , "currencyId"
           , ''     as tag
           , 0      as before
           , 0      as after
           , 0      as xcm
           , 0      as homa
           , amount as cex
      from account_cex_amount) t
group by account, "currencyId", tag
;

create or replace view account_trace_info_with_details as
select account
     , name
     , tag
     , before / pow(10, decimals)                              as before
     , after / pow(10, decimals)                               as after
     , (after - before) / pow(10, decimals)                    as diff
     , xcm / pow(10, decimals)                                 as xcm
     , homa / pow(10, decimals)                                as homa
     , cex / pow(10, decimals)                                 as cex
     , (after - before - xcm - homa - cex) / pow(10, decimals) as gained_used
from account_trace_info
         join currency c on c.id = "currencyId"
;

create or replace view account_trace_info_with_remaining as
select account
     , name
     , sum(before) / pow(10, decimals)                                                                   as before
     , sum(after) / pow(10, decimals)                                                                    as after
     , (sum(after) - sum(before)) / pow(10, decimals)                                                    as diff
     , sum(xcm) / pow(10, decimals)                                                                      as xcm
     , sum(homa) / pow(10, decimals)                                                                     as homa
     , sum(cex) / pow(10, decimals)                                                                      as cex
     , (sum(after) - sum(before) - sum(xcm) - sum(homa) - sum(cex)) /
       pow(10, decimals)                                                                                 as gained_used
     , least(sum(after) - sum(before) - sum(xcm) - sum(homa) - sum(cex), sum(after)) / pow(10, decimals) as remaining
     , tag
from account_trace_info
         join currency c on c.id = "currencyId"
group by account, name, decimals, tag
;

create or replace view traced_accounts as
select distinct account
from tracing_account_balance
where account not in (
                      '23M5ttkmR6KcoCvrNZsA97DQMPxQmqktF8DHYZSDW4HLcEDw', -- loans
                      '23M5ttkmR6KcnxentoqchgBdUjzMDSzFoUyf5qMs7FsmRMvV', -- dex
                      '23M5ttkmR6KcoTAAE6gcmibnKFtVaTP5yxnY8HF1BmrJ2A1i', -- treasury
                      '23M5ttkp2zdM8qa6LFak4BySWZDsAVByjepAfr7kt929S1U9' -- stable asset
    )
;
