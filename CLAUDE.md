


# Claude Code Plugins

## Checking traces with the orq CLI

Always prefer the `orq` CLI over MCP tools for inspecting traces and spans. Use `orq config use prod-claude-code` to switch to the production Claude Code workspace, then `orq trace list`, `orq trace span list <trace-id>`, `orq trace span get <trace-id> <span-id>`. Use `--json` flag for full details.

