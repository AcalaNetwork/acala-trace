/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-return */

const getCall = (args: any) => {
  const [[section, sectionBody]] = Object.entries(args) as any
  const [[method, methodBody]] = Object.entries(sectionBody)
  return {
    name: `${section}.${method}`,
    args: methodBody,
  }
}

const getAllCalls = (call: any): any[] => {
  switch (call.name) {
    case 'Proxy.proxy':
    case 'TransactionPayment.with_fee_path':
    case 'TransactionPayment.with_fee_currency':
      return [getCall(call.args.call)]
    case 'Utility.batch':
    case 'Utility.batch_all':
    case 'Utility.force_batch':
      return call.args.calls.map(getCall)
    default:
      return []
  }
}

export const processCall = (call: any): any[] => {
  const calls = getAllCalls(call)
  if (calls.length === 0) {
    return [call]
  }
  if (calls.length === 1) {
    return processCall({
      ...call,
      ...calls[0],
    })
  }
  const ret = calls.flatMap((x, i) =>
    processCall({
      ...call,
      ...x,
      id: `${call.id}-${i}`,
      success: null,
    })
  )
  ret.push(call)
  return ret
}
