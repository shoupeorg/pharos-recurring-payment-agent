# Pharos Recurring Payment Agent

A public, unsigned-only recurring-payment preparation desk for Pharos Pacific Mainnet (chain ID 1672). A Cloudflare Cron dispatcher creates and validates due occurrences while the browser is closed. A human reviews and signs externally. A transaction is marked **PAID only after independent receipt verification**.

## Architecture

```text
visitor / CLI
    |
    v
Workspace capability --> Cloudflare Worker API --> D1 schedules + immutable occurrences
                              |       ^
                              |       |
                         Cron every minute
                              |
                              v
                    official Pharos Chain MCP
                 balances / code / calls / gas
                              |
                  unsigned transaction export
                              |
                    external human wallet
                              |
             submitted hash --> receipt reconciliation
```

There is no private key, server signer, approval, or broadcast endpoint.

## Four task requirements

1. **Weekly/monthly configuration** — public sender, recipient, PHRS/USDC/custom ERC-20, exact amount, calendar cadence, start, IANA timezone, optional end/limit, and label.
2. **Prepare and track** — Cron persists each due occurrence and moves it through PENDING, VALIDATING, READY_FOR_REVIEW, PREPARED_UNSIGNED, AWAITING_CONFIRMATION, and PAID/failed states.
3. **Failure and duplicate protection** — exact balances and gas are required; D1 uniqueness prevents duplicate occurrences and hash reuse; conditional claims prevent repeated processing. Ambiguous submissions block replacements.
4. **History and next payment** — UI groups pending/paid/failed entries, shows next local and UTC time, heartbeat, provenance, and lateness.

## Calendar semantics

- Weekly means seven calendar days at the original local wall-clock time.
- Monthly uses the original day anchor. Day 31 clamps to February's last day and returns to day 31 in March.
- DST gaps/overlaps use Temporal's documented `compatible` disambiguation: gaps move forward; overlaps choose the earlier occurrence.
- Start dates in the past are accepted for bounded recovery; at most 12 missed occurrences are created per dispatcher pass.
- End dates and occurrence limits are inclusive boundaries.
- Cron is best effort. `scheduledAt`, `detectedAt`, `validatedAt`, `preparedAt`, and measured lateness remain separate.
- Editing creates a new revision. Existing occurrences keep their original terms. Pause prevents future preparation but cannot invalidate an exported transaction.

## Validation and unsigned gate

The agent checks Chain MCP chain ID, native balance, token bytecode/metadata/balance, exact `eth_call`, gas estimate, and gas price. PHRS requires value plus buffered gas; ERC-20 requires token balance plus native gas. Missing data blocks preparation.

Before export the server requires a fresh successful validation and explicit review bound to the immutable occurrence payment digest. Revalidation rejects changed terms, expired validations, and failed/historical evidence. The wallet must populate nonce and compatible fee fields.

## Reconciliation and exactly-once boundary

A hash is only an association. The server independently verifies chain, transaction/receipt identity, sender, destination, native value or decoded ERC-20 calldata, matching Transfer log, receipt success, and confirmations. Pending receipts stay pending; RPC failures are not on-chain failures; mined reverts are FAILED_ONCHAIN. A unique database constraint prevents one hash from crediting two occurrences.

Application-level deduplication cannot guarantee on-chain exactly-once execution if a human signs multiple independent transactions with different nonces. No contract idempotency is claimed.

## Reviewer workflow

1. Fill **1. Schedule setup** and click **CREATE SCHEDULE**.
2. Inspect local/UTC time in **2. Next payment**.
3. For an immediate safe demo click **PREPARE CURRENT OCCURRENCE NOW**.
4. Inspect live evidence, check the review statement, click **CONFIRM HUMAN REVIEW**, then **PREPARE UNSIGNED TRANSACTION**.
5. Download reports. Do not sign for the preparation-only demonstration.
6. Inspect grouped history and scheduler provenance. Shared evidence is read-only.

## Development

```powershell
npm ci
npm test
npm run build
node src/cli.js --cadence WEEKLY --start 2026-11-01T09:00 --timezone Asia/Tehran
```

## Evidence and limitations

Versioned evidence is under `evidence/` and mirrored publicly under `public/evidence/`. Real scheduler proof must have provenance `CRON`; manual API/UI actions are labeled `MANUAL_REVIEWER`. No PAID example is fabricated because no spending is authorized. Deterministic receipt fixtures are labeled SIMULATED.

Limitations: Cron is best effort; Chain MCP gas estimates are unpinned; public addresses do not prove wallet control; token hooks/fees/proxies can alter outcomes; and independent unsigned transfers lack contract-enforced idempotency.

