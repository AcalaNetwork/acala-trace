-- total summary

select c.name,
       before / pow(10, c.decimals) as "before balance",
       after / pow(10, c.decimals)  as "after balance",
       diff / pow(10, c.decimals)   as "balance diff",
       amount / pow(10, c.decimals) as "trace diff"
from (select "currencyId",
             sum(before)              as before,
             sum(after)               as after,
             sum(after) - sum(before) as diff
      from account_trace_info
      where tag = ''
      group by "currencyId"
      order by "currencyId") t
         join (select "currencyId",
                      sum(case when account = t."from" then -amount else amount end) as amount
               from account_trace
                        join trace t on t.id = account_trace."traceId"
               group by "currencyId") t2 on t."currencyId" = t2."currencyId"
         join currency c on c.id = t."currencyId"
order by c.name
;

-- ausd summary

select case when tag = '' then 'aUSD' else 'Debt ' || tag end
     , sum(before) / 1e12                as before
     , sum(after) / 1e12                 as after
     , (sum(after) - sum(before)) / 1e12 as diff
from account_trace_info
where "currencyId" = '{"Token":"AUSD"}'
group by tag
;

-- account raw data

select *
from account_trace_value
order by account
;

-- total summary with traced account

select c.name,
       t.tag,
       before / pow(10, c.decimals) as "before balance",
       after / pow(10, c.decimals)  as "after balance",
       diff / pow(10, c.decimals)   as "balance diff",
       amount / pow(10, c.decimals) as "trace diff"
from (select "currencyId",
             tag,
             sum(before)              as before,
             sum(after)               as after,
             sum(after) - sum(before) as diff
      from account_trace_info
      where account in (select account from traced_accounts)
      group by "currencyId", tag) t
         full outer join (select "currencyId",
                                 sum(case when account = t."from" then -amount else amount end) as amount,
                                 ''                                                             as tag
                          from account_trace
                                   join trace t on t.id = account_trace."traceId"
                          where account in (select account from traced_accounts)
                          group by "currencyId") t2 on t."currencyId" = t2."currencyId" and t.tag = t2.tag
         join currency c on c.id = t."currencyId"
order by c.name, t.tag
;

-- all account balance changes

select account, name, tag, before, after, diff, xcm, homa from account_trace_info_with_details
order by account
;

-- account balance details

select *
from account_trace_info_with_remaining
where account in (select account from traced_accounts)
order by account
;

-- aca remaining

select *
from account_trace_info_with_remaining
where account in (select account from traced_accounts)
  and name = 'ACA'
  and remaining > 1e4
order by remaining desc
;

-- account balance details summary wo dex

select name,
       sum(before)      as before,
       sum(after)       as after,
       sum(diff)        as diff,
       sum(xcm)         as xcm,
       sum(homa)        as homa,
       sum(cex)         as cex,
       sum(gained_used) as gained_used,
       sum(remaining)   as remaining,
       tag
from account_trace_info_with_remaining
where account in (select account from traced_accounts)
group by name, tag
order by name
;


-- account balance details summary with dex

select name,
       sum(before)      as before,
       sum(after)       as after,
       sum(diff)        as diff,
       sum(xcm)         as xcm,
       sum(homa)        as homa,
       sum(cex)         as cex,
       sum(gained_used) as gained_used,
       sum(remaining)   as remaining,
       tag
from account_trace_info_with_remaining
where account in (select account from traced_accounts)
   or account = '23M5ttkmR6KcnxentoqchgBdUjzMDSzFoUyf5qMs7FsmRMvV'
group by name, tag
order by name
;

-- account balance details summary for dex

select name,
       sum(before)      as before,
       sum(after)       as after,
       sum(diff)        as diff,
       sum(xcm)         as xcm,
       sum(homa)        as homa,
       sum(cex)         as cex,
       sum(gained_used) as gained_used,
       sum(remaining)   as remaining
from account_trace_info_with_remaining
where account = '23M5ttkmR6KcnxentoqchgBdUjzMDSzFoUyf5qMs7FsmRMvV'
group by name
order by name
;

-- traced accounts

select *
from traced_accounts
;

-- xcm out to moonbeam

select "from" as account, name, amount / pow(10, decimals) as amount
from trace
         join currency c on trace."currencyId" = c.id
where category = 'xcm-out'
  and "to" = '23UvQ3ZQXJ5LfTUSYkcRPkQX2FHgcKxGmqdxYJe9j5e3Lwsi'
;

-- xcm out to astar

select "from" as account, name, amount / pow(10, decimals) as amount
from trace
         join currency c on trace."currencyId" = c.id
where category = 'xcm-out'
  and "to" = '23UvQ3ZQvYBhhhL4C1Zsn7gfDWcWu3pWyG5boWyGufhyoPbc'
;

-- account events

select t.id, account, name, case when account = t."from" then -amount else amount end as amount
from account_trace
         join trace t on t.id = account_trace."traceId"
join currency c on t."currencyId" = c.id
;

-- gain used

select account, "currencyId", tag, gained_used
from (select account, "currencyId", tag, (after - before - xcm - homa - cex) as gained_used
      from account_trace_info
      where account in (select account from traced_accounts)) t
where gained_used <> 0
;
