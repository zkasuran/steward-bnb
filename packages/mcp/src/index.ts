// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// Library entry for the Steward MCP server: embed the read-only tools in another MCP server via
// createServer or run the stdio binary at ./cli.js (bin: steward-mcp). All tools are read-only BSC
// reads over @steward/sdk; nothing signs, sends, spends or needs a Binance Web3 API key.
export { createServer } from "./server.js"
