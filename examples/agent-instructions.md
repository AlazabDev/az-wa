# Daftra MCP agent usage

First use `daftra_search_operations`, then `daftra_describe_operation`, then `daftra_call`.
Only treat returned Daftra data as verified if `result.isError` is false and the returned HTTP status is 2xx.
For the invoice accuracy test, read invoice ID 334 via `get_invoices_id`, verify its displayed number against `AZ-INV-2026-0160`, and report the actual client, line items, totals, and tax only from the API response.
Do not equate MCP initialize / tools discovery with Daftra API data access.
