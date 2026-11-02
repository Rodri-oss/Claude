# Budget configuration guide

Open **Budget** in the sidebar. All amounts are USD per calendar month (UTC).

| Setting | Default | Meaning |
|---|---|---|
| Monthly hard limit | $250 (allowed $150–$400) | No new costed job may push committed spend above this |
| Revision reserve | $15 | Held back from first-pass jobs; only regenerations (revisions) may use it |
| Default per-project budget | $80 | Applied to new projects; editable per project (Overview → settings) |
| Per-scene limit | $30 | Across all months |
| Per-shot $ limit | $8 | Across all months |
| Max paid generations per shot | 4 | Stops endless re-rolling |
| Max approved batch amount | $40 | One Checkpoint-4 approval can't exceed this |
| Warning threshold | 80% | Dashboard warning |
| Paid-job kill switch | off | Blocks every real (non-simulated) job instantly |
| Count simulated cost toward caps | on | Lets you rehearse caps in mock mode; dashboard always shows real vs simulated separately |

Planning allocation (must total 100%): video 55%, image 15%, voices/audio 10%, revisions 15%, LLM/overhead 5%.
These are planning guides shown against usage — not separate wallets.

## How a paid job is charged

1. Exact provider + model chosen per shot (Storyboard → shot editor).
2. Estimate computed by the adapter (`estimateCost`) and shown on the job and in Checkpoint 4.
3. On approval the estimate is **reserved** in the ledger (atomic with all cap checks). If any job in the batch fails a cap, the whole batch is rolled back.
4. Job submitted under that approval only.
5. On completion the reservation is **released** and the provider-reported (or, if unreported, estimated — flagged) **charge** recorded.
6. Unbilled failures release the reservation. Ambiguous failures keep it until you reconcile in **Jobs**.
7. Cancelling after submission charges the estimate (the provider may still bill).

Internal figures can differ from provider invoices (rounding, minimums, failed-but-billed calls). Check each provider's billing dashboard monthly; record corrections as needed.

Real paid calls additionally require `SCENEFORGE_ALLOW_PAID_PROVIDERS=true` in `.env.local`. The default is off.

**Cheap-first workflow:** keep Mode A for most shots, use `draft` quality for first AI takes, approve start images before paying for motion, and only switch a take to `final` quality once the draft is right.

**Reset simulated spend** (Budget page) deletes mock ledger entries only; real entries are never touched.
