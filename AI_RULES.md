---
# AI_RULES.md — Mandatory Reading Before Any Implementation
This file must be read by any external AI agent before making any changes to this codebase. These rules are non-negotiable and must be followed on every task without exception.
---
## RULE 1 — READ BEFORE YOU WRITE
Before implementing anything, read the relevant existing files to understand the current patterns, naming conventions, and code style. Never assume — always verify by reading first.
---
## RULE 2 — EVERY CHANGE MUST BE ADDITIVE
Unless explicitly instructed to modify or delete something, all implementations must be additive only. New files, new components, new functions. Do not touch what already works.
---
## RULE 3 — CONFIRM SCOPE BEFORE ACTING
If a prompt is ambiguous about which files to change, stop and list the files you plan to modify before making any changes. Never modify files outside the stated scope of the task.
---
## CRITICAL: ARCHITECTURAL BOUNDARIES
The following files and directories must NEVER be modified under any circumstances. Each has a stated reason. Violating these boundaries can break the entire application.
| File / Directory | Reason |
|---|---|
| `index.html` | Main entry point for the web application, essential for initial loading. |
| `src/main.jsx` | React application root entry point, initializes the app and mounts the main component. |
| `src/App.jsx` | Top-level component responsible for global routing, context providers, and overall application structure. |
| `src/Layout.jsx` | Defines the global application layout, wraps all pages, handles shared UI elements like navigation and branding. Critical for consistent appearance and functionality. |
| `tailwind.config.js` | Core Tailwind CSS configuration. Changes can break the entire styling system. |
| `postcss.config.js` | PostCSS configuration, part of the styling pipeline. |
| `src/globals.css` | Contains global CSS imports and base styles including Tailwind directives and custom CSS variables. Essential for overall look and feel. |
| `src/api/base44Client.js` | Pre-initialized Base44 SDK client. Critical for all backend interactions, entity access, and integrations. |
| `src/lib/utils.js` | Contains shared utility functions like `cn` for Tailwind class merging. Critical for UI component functionality. |
| `src/components/ui/` | Contains all core Shadcn UI components. Individual components can be extended or wrapped but base files must not be altered to maintain library integrity. |
| `src/components/config/pagesConfig.js` | Centralized configuration for all pages including routes, navigation visibility, and permission rules. Essential for application structure and access control. |
| `src/components/hooks/usePermissions.jsx` | Handles critical authentication and authorization logic controlling user access across the application. |
| `entities/` | Defines database schemas. Direct modification can lead to data corruption or schema mismatches with the backend. |
| `functions/` | Contains backend function definitions. While the content of individual functions may change, the file structure and Deno.serve export pattern are critical for deployment and must not be restructured. |
| `agents/` | Contains AI agent configurations. Essential for defining agent behavior and capabilities. |
| `src/pages/` | The directory structure enforces a flat hierarchy. Never introduce subfolders within pages/ as this violates a core architectural constraint. All page files must sit directly inside src/pages/. |
---
## RULE 4 — NEW PAGES
When creating a new page:
- Create the file directly inside `src/pages/` with no subfolders
- Use the existing page files in `src/pages/` as reference for structure and import patterns
- Use only components from `src/components/ui/` for UI elements
- Use only TailwindCSS utility classes already present in the project for styling
---
## RULE 5 — NEW COMPONENTS
When creating a new component:
- Create it inside an appropriate subfolder of `src/components/`
- Never modify existing components in `src/components/ui/`
- You may import and wrap existing UI components but never edit them directly
---
## RULE 6 — NEW BACKEND FUNCTIONS
When creating a new backend function:
- Create it as a new file inside `functions/`
- Follow the exact same Deno.serve export pattern used in every existing function file
- Never rename, restructure, or delete existing function files
---
## RULE 7 — STYLING
- Use only TailwindCSS utility classes
- Never write inline styles unless absolutely unavoidable
- Never add new CSS files or modify `src/globals.css`
- Never modify `tailwind.config.js`
---
## RULE 8 — DATA ACCESS
- Always use the pre-initialized client from `src/api/base44Client.js` for all entity and backend interactions
- Never create a new API client or initialize a new SDK instance
- Always refer to `src/api/entities.js` for entity definitions before querying any entity
---
## RULE 9 — AFTER EVERY IMPLEMENTATION
After completing any task confirm the following:
1. List every file that was created
2. List every file that was modified
3. Confirm no file from the CRITICAL ARCHITECTURAL BOUNDARIES table was touched
4. Confirm the implementation matches the scope of the prompt and nothing outside it was changed
---
## RULE 10 — WHEN IN DOUBT
If any instruction is unclear or conflicts with these rules, stop and ask for clarification before proceeding. Never make assumptions that require touching a protected file.
---
*This file is maintained by the project owner. Do not modify AI_RULES.md itself unless explicitly instructed.*

## Date/Time Rendering Rules (CRITICAL — enforce on every task)

Base44 returns two different date formats. Use the correct handler for each.

### Backend auto-timestamps (created_date, updated_date)
These arrive as ISO 8601 UTC strings: "2026-04-20T17:15:00.000Z"
✅ CORRECT: formatInUAE(entity.created_date, 'dd/MM/yyyy hh:mm a')
❌ WRONG:   formatInUAE(parseDateInUAE(entity.created_date), ...)

### Defensive Z-suffix normalization
Base44 may return created_date/updated_date without the Z UTC suffix.
Always normalize before passing to formatInUAE:

    const safeDate = d?.endsWith('Z') ? d : d + 'Z';
    formatInUAE(safeDate, 'format')

Apply this anywhere ActivityLog, AuditLog, or any entity's 
created_date/updated_date is rendered as a display timestamp.


### Custom date fields from date pickers (date_from, date_to, etc.)
These arrive as YYYY-MM-DD strings: "2026-04-20"
✅ CORRECT: formatInUAE(parseDateInUAE(entity.date_from), 'dd/MM/yyyy')
❌ WRONG:   formatInUAE(entity.date_from, ...)

### Never use native JS date formatting
❌ NEVER: new Date().toLocaleString()
❌ NEVER: new Date().toLocaleDateString()
❌ NEVER: new Date().toLocaleTimeString()

Always import from: '@/components/ui/timezone'


## User-Facing Messages Rule

Any message shown to the user in the UI must be written in plain non-technical language that any non-technical person can understand. This applies to:
- Success messages and toast notifications
- Error messages and failure notifications  
- Progress bar phase labels and status updates
- Any inline text shown during an ongoing process

NEVER include in user-facing messages:
- Technical field names, entity names, or database terms
- Batch IDs, record IDs, or any system-generated identifiers
- Words like "rollback", "orphaned records", "batch", "entity", "query", "rate limit", "API", "null", "undefined"
- Stack traces, error codes, or raw error messages
- Internal function names or process names

ALWAYS write messages as if explaining to a non-technical office HR staff member:
- Success: tell them what was accomplished and what to do next if anything
- Error: tell them something went wrong, what to do next, and who to contact if needed — no technical details
- Progress: tell them what is happening in plain words like "Uploading records...", "Please wait...", "Cleaning up..."
