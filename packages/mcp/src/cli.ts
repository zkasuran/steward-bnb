#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// `steward-mcp` over stdio. stdout is the MCP transport, so nothing else may write to it; the one
// diagnostic here goes to stderr.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { createServer } from "./server.js"

async function main(): Promise<void> {
  const server = createServer()
  await server.connect(new StdioServerTransport())
}

main().catch((error: unknown) => {
  process.stderr.write(`steward-mcp: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
