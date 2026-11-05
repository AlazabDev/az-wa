#!/usr/bin/env bash
set -euo pipefail
MCP_URL="https://vlahgxkfpzappxtiwhvd.supabase.co/functions/v1/daftra-mcp"
MCP_KEY="az_df_jCfy6cMh1X6NTxR3OWLuvEFa0si5uZKr05UeoAEs"
call(){ curl -fsS "$MCP_URL" -H "x-mcp-key: $MCP_KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "$1"; echo; }
call '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"alazab-test","version":"1"}}}'
call '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
call '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"daftra_call","arguments":{"operation_id":"get_invoices_id","path_params":{"id":334},"query":{"recursive":1}}}}'
