# Azure Foundry MCP connection

Endpoint: `https://vlahgxkfpzappxtiwhvd.supabase.co/functions/v1/daftra-mcp`
Transport: Streamable HTTP
Authentication: custom header `x-mcp-key` with the value of MCP_ACCESS_KEY.
Where a Foundry MCP client cannot send custom headers, configure a supported credential/header mechanism. Do not put a secret in a committed configuration file.
The actual UI/API connection fields depend on the Foundry agent version and should be validated before deployment.
