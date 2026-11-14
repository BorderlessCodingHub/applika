"""Every MCP tool: applika-cli's commands, no more (ADR-0028)."""

from app.presentation.mcp.registry import McpTool
from app.presentation.mcp.tools import (
    account,
    application_cvs,
    applications,
    catalog,
    cvs,
    timeline,
)

ALL_TOOLS: tuple[McpTool, ...] = (
    *account.TOOLS,
    *catalog.TOOLS,
    *applications.TOOLS,
    *timeline.TOOLS,
    *cvs.TOOLS,
    *application_cvs.TOOLS,
)
