# Web Content Audit

Audit Feishu wiki pages against configurable rules. Checks document structure (required sections) and content quality (via LLM) through a Chrome extension.

## Quick Start

### 1. Install dependencies

```bash
pnpm install
pnpm build
```

### 2. Configure LLM

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
# OpenAI
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=gpt-4o-mini

# Or DeepSeek
# LLM_BASE_URL=https://api.deepseek.com/v1
# LLM_API_KEY=sk-xxx
# LLM_MODEL=deepseek-chat

# Or GLM
# LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
# LLM_API_KEY=xxx
# LLM_MODEL=glm-4-flash
```

### 3. Start the server

```bash
pnpm dev:server
# Server runs at http://localhost:3200
```

### 4. Load Chrome extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/dist/` folder

### 5. Audit a page

1. Open a Feishu wiki page (e.g., a weekly report with "周报" in the title)
2. Click the **Web Content Audit** extension icon in the toolbar
3. Select document type or leave as "Auto-detect"
4. Click **Audit**
5. View results in the popup — sections on the page will be highlighted:
   - **Green** border = passed
   - **Red** border = failed (error)
   - **Yellow** border = warning
   - Hover highlighted sections to see details

## Writing Rules

Rules are YAML files in `server/rulesets/`. Example (`weekly-report.yaml`):

```yaml
id: weekly_report_v1
documentType: weekly_report
displayName: "Weekly Report / 周报"
matchPattern:
  titlePattern: ".*周报.*|.*Weekly.*Report.*"

rules:
  # Structural rule — checks if sections exist (no LLM needed, instant)
  - id: wr_required_sections
    category: structure
    severity: error
    description: "Weekly report must contain required sections"
    check:
      type: structural
      requiredSections:
        - "本周工作"
        - "下周计划"
        - "风险与阻塞"
      sectionAliases:
        "本周工作": ["本周完成", "This Week's Work"]
        "下周计划": ["Next Week's Plan"]
        "风险与阻塞": ["Blockers", "Risks"]

  # Content rule — uses LLM to evaluate quality
  - id: wr_work_item_quality
    category: content
    severity: warning
    description: "Each work item should include task name, progress, and owner"
    check:
      type: content
      targetSection: "本周工作"
      evaluationPrompt: |
        Check each work item. Each should have:
        1. Task/project name
        2. Progress (percentage, status, or milestone)
        3. Owner
        Report which items are missing fields.
```

### Rule types

| Type | `category` | How it works | Speed |
|------|-----------|-------------|-------|
| **Structural** | `structure` | Checks if required sections exist by heading text (with aliases for zh/en) | Instant |
| **Content** | `content` | Sends section text + evaluation prompt to LLM, gets pass/fail + issues | 2-5s |

### Severity levels

| Level | Meaning |
|-------|---------|
| `error` | Must fix — counts as failure |
| `warning` | Should fix — shown as yellow |
| `info` | Nice to have — shown as blue |

### Adding a new document type

1. Create a new YAML file in `server/rulesets/`, e.g. `meeting-notes.yaml`
2. Set `documentType` and `matchPattern` (title regex to auto-detect)
3. Add rules — mix structural and content checks as needed
4. Restart the server — new rules are loaded automatically

## API

The server exposes two endpoints:

```
GET  /api/v1/rulesets          # List all available rule sets
POST /api/v1/audit             # Run audit on a document
```

Example audit request:

```bash
curl -X POST http://localhost:3200/api/v1/audit \
  -H "Content-Type: application/json" \
  -d '{
    "document": {
      "title": "2024-W12 周报",
      "url": "https://feishu.cn/wiki/xxx",
      "sections": [
        {"heading": "本周工作", "headingLevel": 2, "content": "...", "contentHtml": "", "items": [], "domSelector": "#s1"},
        {"heading": "下周计划", "headingLevel": 2, "content": "...", "contentHtml": "", "items": [], "domSelector": "#s2"}
      ],
      "metadata": {"wordCount": 100}
    }
  }'
```

## Project Structure

```
web-content-audit/
├── shared/          # Shared TypeScript types
├── server/          # Fastify backend (audit engine + rule loader)
│   ├── src/
│   │   ├── engine/  # Structural checks + LLM content evaluation
│   │   ├── routes/  # API endpoints
│   │   ├── rules/   # YAML rule loader
│   │   └── llm/     # OpenAI-compatible SDK client
│   └── rulesets/    # Rule definitions (YAML)
├── extension/       # Chrome MV3 extension
│   └── src/
│       ├── content/ # Page parser + highlighter
│       ├── popup/   # Extension popup UI
│       └── api/     # Backend API client
```
