---
name: pharos-recurring-payment-agent
description: Configure and operate unsigned weekly or monthly Pharos payment schedules with live validation and receipt reconciliation.
---

# Pharos Recurring Payment Agent

Use this skill only for Pharos Pacific Mainnet (chain ID 1672) recurring-payment preparation.

1. Collect a public sender, recipient, PHRS/USDC/custom token, exact decimal amount, cadence, local start, IANA timezone, optional end, limit, and label.
2. Validate addresses and exact token precision. Never interpret USD as USDC or missing observations as zero.
3. Explain that weekly/monthly are calendar recurrences. Monthly preserves the original day anchor and clamps only short months. DST uses Temporal's compatible disambiguation.
4. Let the deployed Cron dispatcher create due occurrences. A manual reviewer action must be labeled MANUAL_REVIEWER, never scheduled.
5. Validate each occurrence using official Chain MCP reads. Require balance, gas price, estimate, exact simulation, and chain ID 1672.
6. Require explicit human review before exporting an unsigned transaction. Revalidate and compare immutable payment digests.
7. Never sign, broadcast, request a private key, guess a nonce, or claim PREPARED_UNSIGNED is PAID.
8. Associate a submitted hash with one occurrence only. Verify transaction, receipt, sender, destination, value/calldata, ERC-20 Transfer evidence, success, and confirmations.
9. Missing receipts stay AWAITING_CONFIRMATION. RPC errors become RECONCILIATION_REQUIRED. Reverts become FAILED_ONCHAIN.
10. Report the application-level deduplication boundary: independently signed transactions cannot guarantee on-chain exactly-once execution.

CLI calendar preview:

`node src/cli.js --cadence MONTHLY --start 2026-10-31T09:00 --timezone Asia/Tehran`

The CLI never signs or broadcasts.
