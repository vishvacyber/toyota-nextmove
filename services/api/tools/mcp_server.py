"""MCP server over the tool registry (stdio):  uv run python -m tools.mcp_server

The B3 Claude Agent SDK provider can mount the same registry in-process; this server is the standalone form.
"""

import asyncio
import json

import mcp_types as types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server
from pydantic import ValidationError

from tools import REGISTRY, ToolError, call


async def list_tools(ctx, params) -> types.ListToolsResult:
    return types.ListToolsResult(tools=[types.Tool(name=t.name, description=t.description, input_schema=t.schema)
                                        for t in REGISTRY.values()])


async def call_tool(ctx, params: types.CallToolRequestParams) -> types.CallToolResult:
    try:
        out = call(params.name, params.arguments)
    except (ToolError, ValidationError) as e:   # report to the model so it can correct its input
        return types.CallToolResult(content=[types.TextContent(text=str(e))], is_error=True)
    return types.CallToolResult(content=[types.TextContent(text=json.dumps(out))], structured_content=out)


server = Server("nextmove-tools", version="0.1.0", on_list_tools=list_tools, on_call_tool=call_tool)


async def main() -> None:
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
