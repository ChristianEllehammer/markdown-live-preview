# Multi-document (tabs) — Design

**Date:** 2026-05-30
**Status:** Approved
**Topic:** Allow the app to hold multiple markdown documents, switchable via a tab bar.

## Problem

The app currently holds exactly one document. There is a single Monaco editor and
all content is persisted under one localStorage key (`last_state`). Typing overwrites
that one slot, so there is no way to keep more than one document.

## Goal

Let the user keep multiple documents open and switch between them via a tab bar,
without changing the existing editor | preview split or the global theme / sync-scroll
features.

## Decisions

- **UI metaphor:** a horizontal **tab bar** across the top (below the header), like a
  browser or code editor. (Chosen over a left sidebar list.)
- **Tab naming:** auto-derived from the document's first heading, with **double-click to
  rename** to a custom name.
- **Closing tabs:** close **immediately**, with a brief **undo** affordance.
- **Tab limit:** a reasonable cap of **15** documents.
- **Editor architecture:** one Monaco editor instance, one Monaco **model per document**
  (Approach 1), switched via `editor.setModel(...)`.

## Data model (localStorage)

Persisted via the existing `Storehouse` wrapper under namespace
`com.markdownlivepreview`.

- New key `documents`: an array of document records, in tab order:
  ```
  { id: string, name: string | null, content: string }
  ```
  - `id` — unique string (e.g. timestamp + random suffix).
  - `content` — the markdown text.
  - `name` — a custom name set via rename, or `null` meaning "auto-name from heading".
- New key `active_document_id`: the id of the selected tab, restored on reload.
- Existing global settings keys (`theme_settings`, `scroll_bar_settings`) are unchanged
  and remain shared across all documents.

Content is persisted on every editor change, as it is today. The `documents` array (and
`active_document_id`) is the single source of truth for what tabs exist.

## Migration (existing users)

On load:

1. If `documents` already exists, use it.
2. Otherwise create it:
   - If the old `last_state` key has content, that content becomes the single first
     document.
   - Otherwise the first document is seeded with the default template (the syntax guide).

This guarantees existing users keep their current text, and first-time users still see
the default guide. The legacy `last_state` key may be left in place (read-only fallback);
it is no longer written to once `documents` exists.

## Editor (Approach 1: multiple Monaco models)

- A single Monaco editor instance is created once (as today).
- Each document owns its own Monaco text model (`monaco.editor.createModel(content, 'markdown')`).
- Switching tabs calls `editor.setModel(targetDoc.model)`. This preserves per-document
  **undo history and cursor position** for free.
- The existing `onDidChangeModelContent` handler continues to: re-render the preview,
  persist content, and update the active document's auto-name. It must read/write the
  **active** document rather than a single global slot.
- When a document is closed, its model is disposed (`model.dispose()`) after any undo
  window resolves.

## Tab bar UI

- A horizontal strip rendered between the `<header>` and `#container`.
- Each tab shows a **label** and a **× close** control. A **＋** button at the end of the
  strip adds a new document.
- **Label** = custom `name` if set, else derived live from the first heading line of the
  content (e.g. `# Notes` → "Notes"), falling back to **"Untitled"** when there is no
  heading. The active tab's label updates as the user types.
- **Double-click a tab** opens an inline text input to rename. Committing sets a custom
  `name`; submitting an empty value reverts to auto-naming (`name = null`).
- **New tab (＋)** creates an empty document (`content = ""`, `name = null`, label
  "Untitled") and makes it active. ＋ is disabled when the document count reaches the
  **15** cap.
- **Overflow:** when tabs exceed the available width, the tab bar scrolls horizontally.
- The tab bar respects the existing light/dark theme.

## Behaviors / edge cases

- **Close (×):** removes the tab immediately and shows a brief **"Document closed — Undo"**
  toast. Clicking undo restores the document (content, name, and position in the tab
  order) and re-activates it. The toast auto-dismisses after a few seconds, at which point
  the document's model is disposed.
- Closing the **active** tab activates an adjacent tab (prefer the right neighbor, else the
  left).
- Closing the **last remaining** tab replaces it with a fresh empty "Untitled" document;
  undo still restores the previous content.
- **Reset** operates on the **active** document — it replaces the active document's content
  with the default template, keeping today's confirm-before-replace behavior.
- **Copy** and **Export PDF** operate on the **active** document (they already read the
  current editor / preview, so they work unchanged once the active model is wired up).
- **Theme** and **Sync scroll** remain global toggles affecting all documents.

## Out of scope (v1)

- Drag-to-reorder tabs.
- Multiple windows / split panes showing two documents at once.
- Named file import / export to disk.

These can be added later without changing the data model above.

## Testing notes

Manual verification (no test harness exists in the repo today):

- Fresh load with no prior state → one "Untitled"/guide tab.
- Existing `last_state` content → migrated into the first tab intact.
- Add several tabs, type different content, switch between them → content, undo history,
  and cursor are independent per tab.
- Auto-name updates from the first heading; double-click rename sticks and survives reload.
- Close a tab → undo restores it; closing the last tab yields a fresh empty tab.
- Reset / Copy / Export PDF act on the active tab only.
- Reload → tabs, active tab, and content all restored.
- ＋ disables at 15 tabs.
