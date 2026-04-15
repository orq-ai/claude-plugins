# Adding Orq to Claude Desktop

This guide sets up the Orq connector in the Claude Desktop app so your agents and tools from orq.ai are available directly in Claude.

## Before you start

You need:
- [Claude Desktop](https://claude.ai/download) installed on your Mac or Windows PC
- An orq.ai account
- Your orq.ai API key (find it in your workspace under **Settings → API Keys**)

---

## Step 1 — Open the Claude Desktop config file

**On Mac:**
1. Open Finder
2. Press `Cmd + Shift + G` to open "Go to Folder"
3. Paste this path and press Enter:
   ```
   ~/Library/Application Support/Claude/
   ```
4. Open `claude_desktop_config.json` in any text editor (TextEdit works)

**On Windows:**
1. Press `Win + R`, type `%APPDATA%\Claude\` and press Enter
2. Open `claude_desktop_config.json` in Notepad

> If the file doesn't exist yet, create a new file called `claude_desktop_config.json` in that folder.

---

## Step 2 — Add the Orq connector

Copy the block below and paste it into your config file. Replace `YOUR_ORQ_API_KEY_HERE` with your actual API key.

```json
{
  "mcpServers": {
    "orq": {
      "type": "http",
      "url": "https://my.orq.ai/v2/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ORQ_API_KEY_HERE"
      }
    }
  }
}
```

If your config file already has content (e.g. a `"preferences"` block), add the `"mcpServers"` section inside the existing `{}` — do not replace what's already there. Example:

```json
{
  "preferences": {
    "...existing settings..."
  },
  "mcpServers": {
    "orq": {
      "type": "http",
      "url": "https://my.orq.ai/v2/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ORQ_API_KEY_HERE"
      }
    }
  }
}
```

Save the file.

---

## Step 3 — Restart Claude Desktop

Fully quit Claude Desktop (don't just close the window) and reopen it. You should see **orq** listed as a connected integration.

---

## Step 4 — Test it

Try asking Claude:

- *"List my orq.ai agents"*
- *"Show me my workspace analytics"*
- *"What experiments do I have running?"*

Claude will use your Orq tools automatically.

---

## What's available

Once connected, Claude can:

| Capability | What Claude can do |
|---|---|
| **Agents** | List, view, and create AI agents in your workspace |
| **Analytics** | Query usage metrics, costs, latency, and error rates |
| **Traces** | Search and explore production traces and spans |
| **Experiments** | Create and check experiment runs |
| **Datasets** | Create datasets and manage datapoints |
| **Models** | List available models and their capabilities |

---

## Troubleshooting

**Orq doesn't appear in Claude after restart**
- Double-check the JSON is valid (no missing commas or brackets). Paste it into [jsonlint.com](https://jsonlint.com) to verify.
- Make sure you replaced `YOUR_ORQ_API_KEY_HERE` with your actual key.

**"Unauthorized" errors when using Orq tools**
- Your API key may be wrong or expired. Generate a new one in orq.ai under **Settings → API Keys**.

**Config file not found**
- On Mac, make sure you're looking in `~/Library/Application Support/Claude/` (not `~/Library/Preferences/`).
