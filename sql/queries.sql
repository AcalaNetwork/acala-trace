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

select account,
       name,
       tag,
       before,
       after,
       diff,
       xcm,
       homa
from account_trace_info_with_details
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

-- from user to kucoin

select "from",
       amount / 1e12                                   as amount,
       "from" in (select account from traced_accounts) as is_traced,
       "to",
       transfer_event.id                               as event_id
from transfer_event
         join event e on e.id = transfer_event.id
where "to" in (
               '24Px9gwiXJrVgCvWbSG2rxQHLGCWyzyvCNJdSykcNzhQqyKR',
               '21MBxgCyHZbgxwZEXJMAwFBr1U8TPvssrQ6w9phWruRMyFpf',
               '22miD3fb4GakiYzcURaFfLs6WXAkUmUTX2b4UEdBkzju1MDR',
               '21uDV86a2APWt5StkXrVUsmj9WpEnxCBmi8XCBcDWWguw4Bu',
               '23d19597TN8yxc5wBgmxsXFZ5sgvwy8Zp9pcmWbRPifj6ndx',
               '25Xwa9DBi7kxTBsarSDvQzWDYe8X2u3yW6ZtZ7nyjwpaAg3t',
               '232KzC62oBQJcxGbsZEF61qFmhDADUGoQzbPx4PHPBzNMy8W',
               '23YQ6jFqEXJbDMFYoLT7p4s37nXMJj9Qq9hjjkHy3btw9a6F',
               '25WAnhrQgifqxPdywQEsczXwW7By4eerzTdcXnJaXjLA4m8z',
               '265EuiEu91bMBbrBZiEGEH9mkUJYafMuNYtaMVRk3XHEAdTG',
               '26SPPh1YLqytf8n4mav5XYCBVyJqCG5K7qBQDsZgmvxZQqss',
               '235VD7W6WQgZd6foWuuiVyQ2ow61uT9zAFm6UCrXLKzQ3VPU',
               '26YvA4eQkGf6NtTYDQ53VhpGgPq1wY2yp9iXP3PY8yTeY4nC',
               '22T81YVAstzeL1zx5AZD37dU97ejm5o3fvNcNuU2sNhG5qps',
               '24MUpK1uVBgn8kKVh6dBZjJYXa8RYmNyrh8pEzKjKQdCJXRt',
               '263AqwbsRZmBjHWk7G6FxUrmgr7QxxPWDea5GPPS2aj9CTW7',
               '25XJ7PNthzBkFNb5BhKWxinG9bTK3pcy4AnmL5q8Bd2s2v7c',
               '21BZxNXVHK7JymKGnPPW9wNmQNJYTXhM2CftUsoGPpbfXtks',
               '26MJJCHK6NrnRfxNDXyQfiK6ksUCV7VsHf7jhnmhBp2kv3g5',
               '25XneaSHxu7BAD9fELjBoSR8hmFKUNga4BEL5T5pD3uUo71j',
               '234QeQaiAvNHE9brWo7GL53fYk9yGYs9w8EGqNckaitpeYmw',
               '24at2teh82wYYrYfRy24wbLXzsx6PsbwknRARtJWhfP7D8nG',
               '25TTWHNNFKkK2FNYprV7aeg7T7jyZPRjrW6P6eoLzoFhdDCo',
               '24iqn1Y3EP5qEYNsn3xa5RViDkuqZ96vRUcdyXzCPsvhAiWS',
               '24PzbynuB69QNefP1iisbEjK71jo2uwcRWCVAxeb6XZHxBqF',
               '22AvzuUNAtaunFDthQyS3GSwVeGxqnhf6Kh2G42Kfce9vKJp',
               'zup4jAepDp2W6qG7NbRsoPa8hXdqiS27sqR2rwWZQ6t5PBi',
               '22gr7trdLZR17xZxQe9ax94oGdXQLnjTwuiLvUf8RXtUi8yh',
               '26a6B6w6gVB2EYjHcQt44qrtGKrbTJWaB2QUmKFVXRYWoHqU',
               '217seC4ytA7PLAK3r5tq9rtLmuF6QK3najweZSHvojTZUuxf',
               '23Da2dpGZhiGF45fZFhyZR7ZR9yKZekASjpaRrhdLbY5r6yt',
               '23WGC8YAapwLxz1jpw44NW4VhaQ851KA8d165yahhdWkRJRx',
               '263cUSPicxPXUD1CgHn81KjLpeCFubzm1EqsFu6bpPZKrpDp',
               '217NfYDjiTTt8THZHH2u5pL71KDAgaEspQxz7k9w5WH9Q4A2',
               '25v1BEfEoZSWLr34Jqj5Y4CYGRJEyvtTeuTs8a3rVZGpPjEQ',
               '23En8vsfjc5PwPYGTAwazR39LvtzHQGDX3GnAykECufc5kkK',
               '22JN4pgXfUYavBPtc8DAp6Eh47w2bGxtRhYqNdzbpZkXbVqa',
               '22uZp2mo9gBDSznGx5D7NBS14tJ3zRPztpE4ei2Pi8Ap6w8D',
               '21wnQgeWkjyoCDeBPn41QTeBmSm8ddnd9EsGdgi6YonWsmJv',
               '22NYU4mpwbh5xReRkNTztkc2Xc8Bvwjk1TzYxKEnMefLQ4qP',
               '23xYohWzet7RuHmu2Gq1UMTTdfJ5E7H3EVyhcLnwPHFp3vsq',
               '22zcrNq347jVeZYh6inegwLQfJ4m33cxXf1jTXcv8rj7ZowG',
               '24HzwK2w9tDpDHQ5XQQNii3hFnKewJTWfHaZHqGBALCo1XD7',
               '235kJrfWVrjHjzuHFrGPqk5GZoQjaNryadJZH9S68kAoEQ7L',
               '21kt2qzXjyH6fBeG1VRyB4adFjbwramsVczNHca13eua96pu',
               '25bSEvYqvL7bchtGkvme7ycrHb1hqMvcepsMApmNiR1T9ikf',
               '23DhqhsKDDpFnH2GreWy7Sk4dqUmGCCVPGk5Lpr84jxzBh5T'
    )
  and "from" not in (select address
                     from account
                     where (props ->> 'cex')::boolean)
  and "currencyId" = '{"Token":"AUSD"}'
;

-- from kucoin to user

select "to", amount / 1e12 as amount, "from", transfer_event.id as event_id
from transfer_event
         join event e on e.id = transfer_event.id
where "from" in (
                 '24Px9gwiXJrVgCvWbSG2rxQHLGCWyzyvCNJdSykcNzhQqyKR',
                 '21MBxgCyHZbgxwZEXJMAwFBr1U8TPvssrQ6w9phWruRMyFpf',
                 '22miD3fb4GakiYzcURaFfLs6WXAkUmUTX2b4UEdBkzju1MDR',
                 '21uDV86a2APWt5StkXrVUsmj9WpEnxCBmi8XCBcDWWguw4Bu',
                 '23d19597TN8yxc5wBgmxsXFZ5sgvwy8Zp9pcmWbRPifj6ndx',
                 '25Xwa9DBi7kxTBsarSDvQzWDYe8X2u3yW6ZtZ7nyjwpaAg3t',
                 '232KzC62oBQJcxGbsZEF61qFmhDADUGoQzbPx4PHPBzNMy8W',
                 '23YQ6jFqEXJbDMFYoLT7p4s37nXMJj9Qq9hjjkHy3btw9a6F',
                 '25WAnhrQgifqxPdywQEsczXwW7By4eerzTdcXnJaXjLA4m8z',
                 '265EuiEu91bMBbrBZiEGEH9mkUJYafMuNYtaMVRk3XHEAdTG',
                 '26SPPh1YLqytf8n4mav5XYCBVyJqCG5K7qBQDsZgmvxZQqss',
                 '235VD7W6WQgZd6foWuuiVyQ2ow61uT9zAFm6UCrXLKzQ3VPU',
                 '26YvA4eQkGf6NtTYDQ53VhpGgPq1wY2yp9iXP3PY8yTeY4nC',
                 '22T81YVAstzeL1zx5AZD37dU97ejm5o3fvNcNuU2sNhG5qps',
                 '24MUpK1uVBgn8kKVh6dBZjJYXa8RYmNyrh8pEzKjKQdCJXRt',
                 '263AqwbsRZmBjHWk7G6FxUrmgr7QxxPWDea5GPPS2aj9CTW7',
                 '25XJ7PNthzBkFNb5BhKWxinG9bTK3pcy4AnmL5q8Bd2s2v7c',
                 '21BZxNXVHK7JymKGnPPW9wNmQNJYTXhM2CftUsoGPpbfXtks',
                 '26MJJCHK6NrnRfxNDXyQfiK6ksUCV7VsHf7jhnmhBp2kv3g5',
                 '25XneaSHxu7BAD9fELjBoSR8hmFKUNga4BEL5T5pD3uUo71j',
                 '234QeQaiAvNHE9brWo7GL53fYk9yGYs9w8EGqNckaitpeYmw',
                 '24at2teh82wYYrYfRy24wbLXzsx6PsbwknRARtJWhfP7D8nG',
                 '25TTWHNNFKkK2FNYprV7aeg7T7jyZPRjrW6P6eoLzoFhdDCo',
                 '24iqn1Y3EP5qEYNsn3xa5RViDkuqZ96vRUcdyXzCPsvhAiWS',
                 '24PzbynuB69QNefP1iisbEjK71jo2uwcRWCVAxeb6XZHxBqF',
                 '22AvzuUNAtaunFDthQyS3GSwVeGxqnhf6Kh2G42Kfce9vKJp',
                 'zup4jAepDp2W6qG7NbRsoPa8hXdqiS27sqR2rwWZQ6t5PBi',
                 '22gr7trdLZR17xZxQe9ax94oGdXQLnjTwuiLvUf8RXtUi8yh',
                 '26a6B6w6gVB2EYjHcQt44qrtGKrbTJWaB2QUmKFVXRYWoHqU',
                 '217seC4ytA7PLAK3r5tq9rtLmuF6QK3najweZSHvojTZUuxf',
                 '23Da2dpGZhiGF45fZFhyZR7ZR9yKZekASjpaRrhdLbY5r6yt',
                 '23WGC8YAapwLxz1jpw44NW4VhaQ851KA8d165yahhdWkRJRx',
                 '263cUSPicxPXUD1CgHn81KjLpeCFubzm1EqsFu6bpPZKrpDp',
                 '217NfYDjiTTt8THZHH2u5pL71KDAgaEspQxz7k9w5WH9Q4A2',
                 '25v1BEfEoZSWLr34Jqj5Y4CYGRJEyvtTeuTs8a3rVZGpPjEQ',
                 '23En8vsfjc5PwPYGTAwazR39LvtzHQGDX3GnAykECufc5kkK',
                 '22JN4pgXfUYavBPtc8DAp6Eh47w2bGxtRhYqNdzbpZkXbVqa',
                 '22uZp2mo9gBDSznGx5D7NBS14tJ3zRPztpE4ei2Pi8Ap6w8D',
                 '21wnQgeWkjyoCDeBPn41QTeBmSm8ddnd9EsGdgi6YonWsmJv',
                 '22NYU4mpwbh5xReRkNTztkc2Xc8Bvwjk1TzYxKEnMefLQ4qP',
                 '23xYohWzet7RuHmu2Gq1UMTTdfJ5E7H3EVyhcLnwPHFp3vsq',
                 '22zcrNq347jVeZYh6inegwLQfJ4m33cxXf1jTXcv8rj7ZowG',
                 '24HzwK2w9tDpDHQ5XQQNii3hFnKewJTWfHaZHqGBALCo1XD7',
                 '235kJrfWVrjHjzuHFrGPqk5GZoQjaNryadJZH9S68kAoEQ7L',
                 '21kt2qzXjyH6fBeG1VRyB4adFjbwramsVczNHca13eua96pu',
                 '25bSEvYqvL7bchtGkvme7ycrHb1hqMvcepsMApmNiR1T9ikf',
                 '23DhqhsKDDpFnH2GreWy7Sk4dqUmGCCVPGk5Lpr84jxzBh5T'
    )
  and "to" not in (select address
                   from account)
  and "currencyId" = '{"Token":"AUSD"}'
;