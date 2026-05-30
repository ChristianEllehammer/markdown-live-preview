# Multi-Document Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tab bar so users can keep up to 15 markdown documents open simultaneously, with per-document undo, auto-naming from headings, rename via double-click, and close-with-undo.

**Architecture:** One Monaco editor swaps between per-document Monaco text models (`editor.setModel()`), which preserves independent undo/cursor per document. An in-memory `docs` array (each entry `{ id, name, content, model }`) is the runtime source of truth, persisted to localStorage via the existing `Storehouse` wrapper. A `#tab-bar` div is added to the HTML between the header and the editor/preview split.

**Tech Stack:** Vanilla JS ES modules, Monaco Editor (CDN, v0.52.2), Vite 6, Storehouse-js (localStorage wrapper), DOMPurify, marked, mermaid.

**Spec:** `docs/superpowers/specs/2026-05-30-multi-document-tabs-design.md`

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `index.html` | Modify | Add `#tab-bar` div and `#undo-toast` div to HTML structure |
| `public/css/style.css` | Modify | Tab bar, tab, rename input, and undo toast styles |
| `src/main.js` | Modify | All JS: document model, migration, Monaco multi-model, tab rendering, tab behaviors |

No new files are needed — the feature lives entirely within the existing three files.

---

## Task 1: Tab bar HTML skeleton + CSS

**Files:**
- Modify: `index.html`
- Modify: `public/css/style.css`

- [ ] **Step 1: Add `#tab-bar` and `#undo-toast` to `index.html`**

  In `index.html`, add two elements. Insert `#tab-bar` **between** `</header>` and `<div id="container"`. Add `#undo-toast` **just before** `</body>`.

  Replace the line `<div id="container" class="split-container">` with:

  ```html
  <div id="tab-bar">
    <div id="tabs"></div>
    <button id="add-tab-btn" title="New document">+</button>
  </div>

  <div id="container" class="split-container">
  ```

  And add this just before `</body>`:

  ```html
  <div id="undo-toast" class="hidden">
    <span>Document closed</span>
    <button id="undo-btn">Undo</button>
  </div>
  ```

- [ ] **Step 2: Add tab bar CSS to `public/css/style.css`**

  Append the following to the end of `public/css/style.css`:

  ```css
  /* ---- Tab bar ---- */
  #tab-bar {
    display: flex;
    align-items: stretch;
    background-color: #3a3a3a;
    border-bottom: 1px solid #2a2a2a;
    overflow-x: auto;
    flex-shrink: 0;
    scrollbar-width: thin;
    scrollbar-color: #666 transparent;
    height: 35px;
    box-sizing: border-box;
  }

  #tabs {
    display: flex;
    align-items: stretch;
    flex: 1;
  }

  .tab {
    display: flex;
    align-items: center;
    padding: 0 6px 0 12px;
    min-width: 80px;
    max-width: 180px;
    height: 100%;
    cursor: pointer;
    border-right: 1px solid #2a2a2a;
    font-size: 12px;
    color: #ccc;
    user-select: none;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .tab:hover {
    background-color: #444;
  }

  .tab.active {
    background-color: #1e1e1e;
    color: #fff;
    border-top: 2px solid #007acc;
    padding-top: 0;
  }

  .tab-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .tab-close {
    margin-left: 6px;
    opacity: 0;
    font-size: 14px;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
    color: #ccc;
  }

  .tab:hover .tab-close,
  .tab.active .tab-close {
    opacity: 0.6;
  }

  .tab-close:hover {
    opacity: 1 !important;
    background-color: rgba(255, 255, 255, 0.15);
  }

  .tab-rename-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1px solid #007acc;
    color: inherit;
    font-size: 12px;
    font-family: inherit;
    outline: none;
    padding: 0;
    min-width: 0;
  }

  #add-tab-btn {
    padding: 0 14px;
    font-size: 18px;
    line-height: 1;
    color: #ccc;
    cursor: pointer;
    flex-shrink: 0;
    border: none;
    background: none;
    height: 100%;
  }

  #add-tab-btn:hover {
    color: #fff;
    background-color: #444;
  }

  #add-tab-btn:disabled {
    color: #555;
    cursor: default;
    background: none;
  }

  /* ---- Undo toast ---- */
  #undo-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #323232;
    color: #fff;
    padding: 10px 16px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 9999;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
    font-size: 13px;
    white-space: nowrap;
  }

  #undo-toast.hidden {
    display: none;
  }

  #undo-btn {
    background: none;
    border: none;
    color: #90caf9;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    font-family: inherit;
  }

  #undo-btn:hover {
    text-decoration: underline;
  }

  /* ---- Light theme tab bar overrides ---- */
  [data-theme="light"] #tab-bar {
    background-color: #f0f0f0;
    border-bottom: 1px solid #d0d0d0;
  }

  [data-theme="light"] .tab {
    color: #555;
    border-right-color: #d0d0d0;
  }

  [data-theme="light"] .tab:hover {
    background-color: #e0e0e0;
  }

  [data-theme="light"] .tab.active {
    background-color: #fff;
    color: #111;
  }

  [data-theme="light"] .tab-close {
    color: #555;
  }

  [data-theme="light"] .tab-close:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }

  [data-theme="light"] #add-tab-btn {
    color: #555;
  }

  [data-theme="light"] #add-tab-btn:hover {
    color: #111;
    background-color: #e0e0e0;
  }

  [data-theme="light"] #add-tab-btn:disabled {
    color: #bbb;
  }
  ```

- [ ] **Step 3: Start the dev server and verify the tab bar renders**

  ```bash
  npm run dev
  ```

  Open the URL printed in the terminal (e.g. `http://localhost:5173`). You should see a grey strip below the header with a `+` button and no tabs yet. The rest of the app (editor, preview) should still work normally.

- [ ] **Step 4: Commit**

  ```bash
  git add index.html public/css/style.css
  git commit -m "feat: add tab bar and undo toast HTML/CSS skeleton"
  ```

---

## Task 2: Document data model helpers in `src/main.js`

**Files:**
- Modify: `src/main.js`

This task adds the storage layer and migration logic. No visible change to app behavior yet.

- [ ] **Step 1: Add constants and helper functions at the top of `init()`**

  In `src/main.js`, inside the `init()` function, find the block of `const localStorageNamespace` / `const localStorageKey` declarations (lines 11–14). After `localStorageKey` and before `localStorageScrollBarKey`, add:

  ```js
  const DOCS_KEY = 'documents';
  const ACTIVE_DOC_KEY = 'active_document_id';
  const MAX_TABS = 15;
  ```

  Then, after the `defaultInput` template string (after the closing backtick on approximately line 96), add these helper functions before `self.MonacoEnvironment = ...`:

  ```js
  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const createDoc = (content = '', name = null) => ({ id: generateId(), name, content });

  const getAutoName = (content) => {
      const match = content.match(/^#{1,6}\s+(.+)/m);
      return match ? match[1].trim() : 'Untitled';
  };

  const getTabLabel = (doc) => doc.name !== null ? doc.name : getAutoName(doc.content);
  ```

- [ ] **Step 2: Add document persistence functions**

  After `getTabLabel`, add:

  ```js
  let docs = [];
  let activeDocId = null;

  const persistDocs = () => {
      const expiredAt = new Date(2099, 1, 1);
      const toSave = docs.map(({ id, name, content }) => ({ id, name, content }));
      Storehouse.setItem(localStorageNamespace, DOCS_KEY, toSave, expiredAt);
      Storehouse.setItem(localStorageNamespace, ACTIVE_DOC_KEY, activeDocId, expiredAt);
  };
  ```

- [ ] **Step 3: Add migration / init function**

  After `persistDocs`, add:

  ```js
  const initDocs = () => {
      const saved = Storehouse.getItem(localStorageNamespace, DOCS_KEY);
      if (Array.isArray(saved) && saved.length > 0) {
          docs = saved;
          const savedActiveId = Storehouse.getItem(localStorageNamespace, ACTIVE_DOC_KEY);
          activeDocId = docs.find(d => d.id === savedActiveId) ? savedActiveId : docs[0].id;
          return;
      }
      // migrate from legacy key, or seed with default template
      const legacy = Storehouse.getItem(localStorageNamespace, localStorageKey);
      const firstDoc = createDoc(legacy || defaultInput);
      docs = [firstDoc];
      activeDocId = firstDoc.id;
  };
  ```

- [ ] **Step 4: Verify the app still loads (no errors in console)**

  With `npm run dev` still running, reload the browser. Open devtools → Console. There should be no errors. The editor still shows the saved/default content because we haven't wired anything up yet.

- [ ] **Step 5: Commit**

  ```bash
  git add src/main.js
  git commit -m "feat: add multi-doc data model, persistence helpers, and migration"
  ```

---

## Task 3: Monaco multi-model + tab switching

**Files:**
- Modify: `src/main.js`

After this task, switching between documents (which we'll add in Task 4) will work correctly with independent undo history per document.

- [ ] **Step 1: Create a Monaco model for each document on startup**

  After the `initDocs` function definition, add:

  ```js
  const initDocModels = () => {
      docs.forEach(doc => {
          doc.model = monaco.editor.createModel(doc.content, 'markdown');
      });
  };
  ```

- [ ] **Step 2: Add a `switchToDoc` function**

  After `initDocModels`, add:

  ```js
  const switchToDoc = (id) => {
      const doc = docs.find(d => d.id === id);
      if (!doc) return;
      activeDocId = id;
      editor.setModel(doc.model);
      convert(doc.model.getValue());
      renderTabs(); // defined in Task 4 — forward reference is fine
      persistDocs();
  };
  ```

- [ ] **Step 3: Update `onDidChangeModelContent` to save to the active doc**

  Find the existing `editor.onDidChangeModelContent` handler inside `setupEditor` (around line 122). Replace its entire body with:

  ```js
  editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      const activeDoc = docs.find(d => d.id === activeDocId);
      if (activeDoc) {
          activeDoc.content = value;
          if (value !== defaultInput) hasEdited = true;
          if (activeDoc.name === null) {
              const tabEl = document.querySelector(`.tab[data-id="${activeDocId}"]`);
              if (tabEl) {
                  const label = tabEl.querySelector('.tab-label');
                  if (label && label.tagName !== 'INPUT') {
                      label.textContent = getAutoName(value);
                  }
              }
          }
      }
      convert(value);
      persistDocs();
  });
  ```

  This replaces the old `saveLastContent(value)` call with `persistDocs()` and adds live label updating.

- [ ] **Step 4: Wire up `initDocs` and `initDocModels` at the entry point**

  Find the entry point block near the bottom of `init()` (around line 643). It currently starts with:

  ```js
  let lastContent = loadLastContent();
  let editor = setupEditor();
  if (lastContent) {
      presetValue(lastContent);
  } else {
      presetValue(defaultInput);
  }
  ```

  Replace those lines with:

  ```js
  initDocs();
  let editor = setupEditor();
  initDocModels();
  const activeDoc = docs.find(d => d.id === activeDocId);
  editor.setModel(activeDoc.model);
  convert(activeDoc.model.getValue());
  ```

  Note: `presetValue` is no longer called at startup — the model already has the right content. Keep the `presetValue` function itself in the file; it is still used by `reset()`.

- [ ] **Step 5: Verify no console errors and editor still shows content**

  Reload the browser. The editor should display the same content as before (migrated from `last_state` or the default template). Open devtools → Application → Local Storage and confirm a `documents` key now exists alongside the old `last_state`.

- [ ] **Step 6: Commit**

  ```bash
  git add src/main.js
  git commit -m "feat: wire Monaco multi-model per document, switch via setModel"
  ```

---

## Task 4: Tab rendering + add new tab (＋ button)

**Files:**
- Modify: `src/main.js`

After this task the tab bar will render real tabs and the ＋ button will work.

- [ ] **Step 1: Add `renderTabs` function**

  After the `switchToDoc` function, add:

  ```js
  const renderTabs = () => {
      const tabsEl = document.getElementById('tabs');
      const addBtn = document.getElementById('add-tab-btn');
      tabsEl.innerHTML = '';

      docs.forEach(doc => {
          const tab = document.createElement('div');
          tab.className = 'tab' + (doc.id === activeDocId ? ' active' : '');
          tab.dataset.id = doc.id;

          const label = document.createElement('span');
          label.className = 'tab-label';
          label.textContent = getTabLabel(doc);

          const closeBtn = document.createElement('span');
          closeBtn.className = 'tab-close';
          closeBtn.textContent = '×';
          closeBtn.title = 'Close';

          tab.appendChild(label);
          tab.appendChild(closeBtn);
          tabsEl.appendChild(tab);

          tab.addEventListener('click', (e) => {
              if (e.target === closeBtn) return;
              switchToDoc(doc.id);
          });

          closeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              closeDoc(doc.id); // defined in Task 6 — forward reference
          });

          label.addEventListener('dblclick', (e) => {
              e.stopPropagation();
              startRename(tab, doc); // defined in Task 7 — forward reference
          });
      });

      addBtn.disabled = docs.length >= MAX_TABS;
  };
  ```

- [ ] **Step 2: Add `addNewDoc` function**

  After `renderTabs`, add:

  ```js
  const addNewDoc = () => {
      if (docs.length >= MAX_TABS) return;
      const doc = createDoc('');
      doc.model = monaco.editor.createModel('', 'markdown');
      docs.push(doc);
      switchToDoc(doc.id);
  };
  ```

- [ ] **Step 3: Wire up ＋ button and call `renderTabs` at startup**

  Find the entry point block (the lines you edited in Task 3 Step 4). After `convert(activeDoc.model.getValue());`, add:

  ```js
  renderTabs();
  document.getElementById('add-tab-btn').addEventListener('click', addNewDoc);
  ```

- [ ] **Step 4: Verify in browser**

  Reload. You should see one tab in the tab bar (labelled from the first heading of your content, e.g. "Markdown syntax guide"). Clicking ＋ should open a new blank tab labelled "Untitled" and the editor should go blank. Clicking back on the first tab should restore its content. Check devtools console — no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/main.js
  git commit -m "feat: render tab bar and implement add-new-tab"
  ```

---

## Task 5: Close tab + undo toast

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add undo state variables**

  At the top of `init()`, alongside the existing `let hasEdited = false;` and `let scrollBarSync = false;`, add:

  ```js
  let undoState = null;
  let undoTimer = null;
  ```

- [ ] **Step 2: Add toast show/hide/undo functions**

  After the `addNewDoc` function, add:

  ```js
  const showUndoToast = () => {
      if (undoTimer) clearTimeout(undoTimer);
      document.getElementById('undo-toast').classList.remove('hidden');
      undoTimer = setTimeout(() => disposeUndo(), 5000);
  };

  const disposeUndo = () => {
      document.getElementById('undo-toast').classList.add('hidden');
      if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
      if (undoState) { undoState.doc.model.dispose(); undoState = null; }
  };

  const undoClose = () => {
      if (!undoState) return;
      const { doc, index } = undoState;
      undoState = null;
      docs.splice(index, 0, doc);
      if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
      document.getElementById('undo-toast').classList.add('hidden');
      switchToDoc(doc.id);
  };
  ```

- [ ] **Step 3: Add `closeDoc` function**

  After the toast helpers, add:

  ```js
  const closeDoc = (id) => {
      const index = docs.findIndex(d => d.id === id);
      if (index < 0) return;

      if (undoState) disposeUndo();

      const [removed] = docs.splice(index, 1);
      undoState = { doc: removed, index };

      if (docs.length === 0) {
          const fresh = createDoc('');
          fresh.model = monaco.editor.createModel('', 'markdown');
          docs.push(fresh);
          activeDocId = fresh.id;
      } else if (activeDocId === id) {
          const newIndex = Math.min(index, docs.length - 1);
          activeDocId = docs[newIndex].id;
      }

      const nowActive = docs.find(d => d.id === activeDocId);
      editor.setModel(nowActive.model);
      convert(nowActive.model.getValue());
      renderTabs();
      persistDocs();
      showUndoToast();
  };
  ```

- [ ] **Step 4: Wire up the undo button**

  In the entry point block (after `document.getElementById('add-tab-btn').addEventListener('click', addNewDoc);`), add:

  ```js
  document.getElementById('undo-btn').addEventListener('click', undoClose);
  ```

- [ ] **Step 5: Verify in browser**

  1. Create two tabs with different content.
  2. Click × on one. It should disappear immediately; a toast "Document closed — Undo" should appear at the bottom.
  3. Click Undo. The tab should reappear with its content intact.
  4. Close a tab and wait 5 seconds. The toast should auto-dismiss.
  5. Verify closing the last tab results in a fresh Untitled tab (not an empty state).

- [ ] **Step 6: Commit**

  ```bash
  git add src/main.js
  git commit -m "feat: close tab with immediate undo toast"
  ```

---

## Task 6: Double-click rename

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add `startRename` function**

  After the `closeDoc` function, add:

  ```js
  const startRename = (tabEl, doc) => {
      const label = tabEl.querySelector('.tab-label');
      if (!label) return;

      const input = document.createElement('input');
      input.className = 'tab-rename-input';
      input.type = 'text';
      input.value = doc.name !== null ? doc.name : getAutoName(doc.content);

      let committed = false;

      const commit = (save) => {
          if (committed) return;
          committed = true;
          if (save) {
              const val = input.value.trim();
              doc.name = val || null;
              persistDocs();
          }
          renderTabs();
      };

      label.replaceWith(input);
      input.focus();
      input.select();

      input.addEventListener('blur', () => commit(true));
      input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(true); }
          if (e.key === 'Escape') { e.preventDefault(); commit(false); }
      });
  };
  ```

- [ ] **Step 2: Verify in browser**

  1. Double-click a tab label. An inline text input should appear in the tab.
  2. Type a new name and press Enter. The tab should show the new name.
  3. Double-click again, clear the name, press Enter. The label should revert to the auto-name from the heading.
  4. Double-click, type something, press Escape. The label should not change.
  5. Reload the page. Custom names should survive.

- [ ] **Step 3: Commit**

  ```bash
  git add src/main.js
  git commit -m "feat: double-click tab to rename, Escape cancels"
  ```

---

## Task 7: Update Reset to work on the active document

**Files:**
- Modify: `src/main.js`

Currently `reset()` calls `presetValue(defaultInput)` which calls `editor.setValue(...)`, triggering `onDidChangeModelContent` which saves to the active doc — so it mostly works already. But it doesn't clear the active doc's custom name. This task fixes that and verifies the other toolbar actions.

- [ ] **Step 1: Update the `reset` function**

  Find the existing `reset` function (around line 266). Replace it with:

  ```js
  let reset = () => {
      let changed = editor.getValue() !== defaultInput;
      if (hasEdited || changed) {
          const confirmed = window.confirm(confirmationMessage);
          if (!confirmed) return;
      }
      const activeDoc = docs.find(d => d.id === activeDocId);
      if (activeDoc) activeDoc.name = null;
      presetValue(defaultInput);
      renderTabs();
      document.querySelectorAll('.column').forEach((element) => {
          element.scrollTo({ top: 0 });
      });
  };
  ```

- [ ] **Step 2: Verify Reset, Copy, and Export PDF all operate on the active document**

  1. Create two tabs with different content (e.g. "# Hello" and "# World").
  2. Select the "# World" tab. Click **Copy**. Paste somewhere — it should be "# World" content, not "# Hello".
  3. Select "# Hello" tab. Click **Reset**. Confirm. The tab should fill with the default template, and its label should update.
  4. If `html2pdf` is available in your browser, click **Export PDF** on one tab — the PDF should contain only that tab's content.

  (Copy and Export PDF already read from `editor.getValue()` and `#preview-wrapper`, which always reflect the active model — no code changes needed for those.)

- [ ] **Step 3: Final end-to-end smoke test**

  1. Open the app fresh (no prior state). Should see one tab with the default guide.
  2. Add 3 more tabs. Type `# Alpha`, `# Beta`, `# Gamma` in each.
  3. Reload. All 4 tabs should be restored with correct labels and content.
  4. Switch tabs — undo/redo (`Cmd/Ctrl+Z`) should work independently per tab.
  5. Close a tab, undo — it comes back at the same position.
  6. Double-click rename a tab. Reload — name persists.
  7. Add tabs until you hit 15 — the ＋ button should grey out and do nothing.
  8. Test dark mode toggle — tab bar should switch to light colours.

- [ ] **Step 4: Commit**

  ```bash
  git add src/main.js
  git commit -m "feat: reset clears active doc name, verify toolbar operates on active doc"
  ```

---

## Self-Review Checklist

- **Spec coverage:**
  - ✅ Tab bar UI with ＋ and × — Tasks 1, 4
  - ✅ Auto-name from heading — Tasks 2 (`getAutoName`), 3 (`onDidChangeModelContent` live update)
  - ✅ Double-click rename — Task 6
  - ✅ Monaco multi-model (independent undo/cursor) — Task 3
  - ✅ Data model (`documents`, `active_document_id`) — Task 2
  - ✅ Migration from `last_state` — Task 2
  - ✅ Close immediately + undo toast (5 s) — Task 5
  - ✅ Closing last tab yields fresh Untitled — Task 5 (`closeDoc`)
  - ✅ Closing active tab activates neighbor — Task 5 (`closeDoc`)
  - ✅ 15-tab cap, ＋ disables at cap — Tasks 2 (`MAX_TABS`), 4 (`renderTabs`, `addNewDoc`)
  - ✅ Horizontal scroll overflow — Task 1 CSS (`overflow-x: auto`)
  - ✅ Reset/Copy/Export on active doc — Task 7
  - ✅ Theme (light/dark) respected — Task 1 CSS
  - ✅ Persist + restore on reload — Tasks 2–4

- **No placeholders found**

- **Type consistency:** `doc.model` is set in `initDocModels` (Task 3) and `addNewDoc` (Task 4); read in `switchToDoc`, `closeDoc`, `disposeUndo` — consistent. `doc.name` is `null | string` throughout — consistent. `docs` array is always `{ id, name, content, model }` in memory; persisted without `model` — consistent.
