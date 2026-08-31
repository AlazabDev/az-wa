# Meta inventory audit — 2026-08-31

Source: operator-provided full Meta Platform inventory generated with Graph API `v26.0`.

This document intentionally contains **no access tokens, App Secrets, Verify Tokens or secret material**. Fingerprints are also omitted because they are unnecessary for runtime operation.

## Audited control-plane snapshot

- Generated: `2026-08-31T09:31:34Z`
- Graph API: `v26.0`
- Business Portfolio: `314437023701205`
- Meta apps inventoried: `7`
- Access tokens inventoried: `11`
- Tokens reported valid by the inventory: `10`
- WABAs: `6`
- WhatsApp phone numbers: `8`
- Message templates: `94`
- WhatsApp Flows: `21`
- WABA subscribed-app records: `17`

The AzWA application is:

- App ID: `1061494059972503`
- Name: `AzWA`
- Namespace: `azwhatsapp`

## Current WABAs

| Meta WABA ID       | Name            | Phones | Templates | Flows |
| ------------------ | --------------- | -----: | --------: | ----: |
| `1303965001665007` | Alazab          |      1 |         2 |     1 |
| `1458856398934130` | Azab            |      2 |        20 |     4 |
| `1527103499063250` | Alazab Projects |      1 |         9 |     4 |
| `2144651456337012` | Mohamed Azab    |      1 |        22 |     5 |
| `2154838801923462` | Alazab Eg       |      1 |         0 |     0 |
| `459851797218855`  | UberFix         |      2 |        41 |     7 |

Runtime discovery remains authoritative. These IDs/counts are an audit baseline only.

## Current phone inventory

| Phone Number ID    | Number          | Audit status     |
| ------------------ | --------------- | ---------------- |
| `1061490140383829` | +20 11 46397010 | active           |
| `1032441389943808` | +1 206-479-5608 | active           |
| `952530191273396`  | +1 208-379-9564 | active           |
| `1197837903405393` | +20 11 46395966 | active           |
| `1020054711186921` | +1 205-460-5650 | active           |
| `1011864912017679` | +20 10 92750351 | **disconnected** |
| `644995285354639`  | +1 555-728-5727 | active           |
| `527697617099639`  | +1 555-724-5001 | active           |

`1011864912017679` must not be enabled as a sender until Meta reports it active again. The database trigger in the inventory-completion migration enforces this rule for all non-active numbers.

## Inventory drift from the legacy reference

The previous reference included:

- WABA `922964860845619`
- Phone Number ID `1328521857002632`
- Number `+20 11 5723 930`

Neither asset appears in the current `owned_whatsapp_business_accounts` inventory. Reconciliation must retain historical database records and mark them missing/inactive rather than delete them.

## Production blockers found in the supplied inventory

### 1. AzWA App webhook subscription is absent

The AzWA application inventory returned an empty `webhook_subscriptions.items` collection.

Production requirement:

1. Configure the canonical callback `https://wa.alazab.com/webhooks/meta/whatsapp`.
2. Store Verify Token, App Secret and App Access Token through AzWA Vault-backed Meta App configuration.
3. Run the App webhook reconciliation.
4. Re-inspect the App subscription and require an active WhatsApp Business Account subscription before release.

`src/lib/meta/app-webhook.server.ts` owns this inspection/reconciliation path.

### 2. AzWA is not present in the audited WABA subscribed-app sets

The six WABA snapshots contained subscriptions to other Meta applications, but App ID `1061494059972503` was not present in any audited WABA `subscribed_apps` list.

Production requirement:

- Business Portfolio synchronization must call WABA subscription reconciliation for every discovered active WABA.
- The post-sync `waba_subscribed_apps` inventory must show `is_azwa=true` for every active WABA.
- Health → Meta production readiness treats a missing AzWA subscription as a critical release blocker.

### 3. AzWA System User token scope needs production verification

The two valid AzWA system-user token records in the inventory report these granted permissions:

- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `whatsapp_business_manage_events`
- `manage_app_solution`
- `read_audience_network_insights`
- `public_profile`

The inventory does **not** report `business_management` on those AzWA tokens. The current Portfolio discovery validator intentionally requires:

- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `business_management`

Therefore production must not assume the token is sufficient merely because it can send WhatsApp messages. Health → Meta production readiness performs live credential validation and must be green before release. If `business_management` remains missing, issue/assign a System User token with the required Business asset permission rather than weakening the discovery gate without evidence.

### 4. One inventory token is invalid

The global inventory reports 10 valid tokens out of 11. The invalid token belongs to another application label, not the AzWA App. It is not an AzWA runtime credential and must not be imported into the AzWA Vault.

## Inventory elements implemented in AzWA

The current codebase supports/reconciles the WhatsApp-specific assets discovered by this audit:

- Business Portfolio → WABA → Phone Number discovery
- owned and client WABA reconciliation
- missing-asset retention instead of hard deletion
- message-template synchronization
- WhatsApp Flow synchronization and lifecycle operations
- WABA subscribed-app inventory
- WABA assigned-user inventory
- WABA app subscription reconciliation
- Meta App webhook inspection/reconciliation
- Graph v26 configuration
- account mode / coexistence metadata
- disconnected/restricted/missing sender safety
- Vault-backed Verify Token, App Secret, App Access Token and System User Token
- API/health logging
- inventory drift/readiness reporting

Assets from the supplied full Meta Platform inventory that are not WhatsApp control-plane assets (Pages, Instagram, Ads, Pixels, Catalogs, Threads) are intentionally not imported into AzWA because AzWA is the WhatsApp Business Operations OS. They remain owned by their respective platform applications and are not required for WhatsApp production runtime.

## Final release evidence required

Production is not considered complete until all of the following are observed against the live Meta control plane and production database:

1. Production CI green.
2. Database preflight has no blockers.
3. Inventory-completion migration is present in production where required.
4. All four secret credential classes are active in Vault.
5. Live System User Token validation passes required scopes.
6. Live App webhook subscription is healthy.
7. AzWA is subscribed to every active WABA.
8. Business sync discovers at least the six audited WABAs and eight audited phone numbers, or explicitly reports legitimate drift.
9. The disconnected audited phone is not enabled for sending.
10. Templates and Flows reconcile to live Meta without silent deletion.
11. Inbound text and media webhooks work end-to-end.
12. Outbound text and an approved template work from an active sender.
13. Sent/delivered/read/failed status transitions are persisted.
14. `/healthz` and `/readyz` return HTTP 200.
15. Health → Meta production readiness reports zero critical failures.
