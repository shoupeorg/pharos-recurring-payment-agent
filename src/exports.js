export function jsonReport(schedule,occurrence){return JSON.stringify({reportType:"RECURRING_PAYMENT_OCCURRENCE",schedule,occurrence,disclosure:"A prepared unsigned transaction is not paid. No signing or broadcasting is performed."},null,2);}
export function markdownReport(schedule,o){return `# Recurring payment occurrence

- Schedule: ${schedule.label} (${schedule.scheduleId} rev ${schedule.revision})
- State: ${o.state}
- Scheduled local: ${o.scheduledLocal} ${o.timezone}
- Scheduled UTC: ${new Date(o.scheduledAtMs).toISOString()}
- Detected: ${o.detectedAt}
- Validated: ${o.validatedAt||"not validated"}
- Prepared: ${o.preparedAt||"not prepared"}
- Sender: ${o.terms.sender}
- Recipient: ${o.terms.recipient}
- Asset: ${o.terms.asset}${o.terms.tokenContract?` (${o.terms.tokenContract})`:""}
- Amount: ${o.terms.amount}
- Transaction hash: ${o.transactionHash||"none"}

> A prepared unsigned transaction is not paid. No signing or broadcasting is performed.
`;}
