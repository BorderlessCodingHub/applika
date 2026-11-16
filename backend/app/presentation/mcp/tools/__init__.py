"""Every MCP tool: applika-cli's commands (ADR-0028), plus ``guide``, the
server's instructions as a tool (ADR-0028, amendment 1)."""

from app.presentation.mcp.registry import McpTool
from app.presentation.mcp.tools import (
    account,
    application_cvs,
    applications,
    catalog,
    cvs,
    cycles,
    guide,
    timeline,
)

ALL_TOOLS: tuple[McpTool, ...] = (
    *guide.TOOLS,
    *account.TOOLS,
    *catalog.TOOLS,
    *applications.TOOLS,
    *cycles.TOOLS,
    *timeline.TOOLS,
    *cvs.TOOLS,
    *application_cvs.TOOLS,
)
