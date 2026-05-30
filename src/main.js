import Storehouse from 'storehouse-js';
import * as monaco from 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/+esm';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

const init = () => {
    let hasEdited = false;
    let scrollBarSync = false;
    let undoState = null;
    let undoTimer = null;

    const localStorageNamespace = 'com.markdownlivepreview';
    const localStorageKey = 'last_state';
    const DOCS_KEY = 'documents';
    const ACTIVE_DOC_KEY = 'active_document_id';
    const MAX_TABS = 15;
    const localStorageScrollBarKey = 'scroll_bar_settings';
    const localStorageThemeKey = 'theme_settings';
    const confirmationMessage = 'Are you sure you want to reset? Your changes will be lost.';
    let mermaidRenderTimer = null;
    let mermaidRenderVersion = 0;
    // default template
    const defaultInput = `# Markdown syntax guide

## Headers

# This is a Heading h1
## This is a Heading h2
###### This is a Heading h6

## Emphasis

*This text will be italic*  
_This will also be italic_

**This text will be bold**  
__This will also be bold__

_You **can** combine them_

## Lists

### Unordered

* Item 1
* Item 2
* Item 2a
* Item 2b
    * Item 3a
    * Item 3b

### Ordered

1. Item 1
2. Item 2
3. Item 3
    1. Item 3a
    2. Item 3b

## Images

![This is an alt text.](/image/Markdown-mark.svg "This is a sample image.")

## Links

You may be using [Markdown Live Preview](https://markdownlivepreview.com/).

## Blockquotes

> Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.
>
>> Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.

## Tables

| Left columns  | Right columns |
| ------------- |:-------------:|
| left foo      | right foo     |
| left bar      | right bar     |
| left baz      | right baz     |

## Blocks of code

${"`"}${"`"}${"`"}
let message = 'Hello world';
alert(message);
${"`"}${"`"}${"`"}

## Mermaid diagrams
${"`"}${"`"}${"`"}mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Finish]
  B -->|No| D[Alternate]
${"`"}${"`"}${"`"}

## Inline code

This web site is using ${"`"}markedjs/marked${"`"}.
`;

    const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const createDoc = (content = '', name = null) => ({ id: generateId(), name, content });

    const getAutoName = (content) => {
        const match = content.match(/^#{1,6}\s+(.+)/m);
        return match ? match[1].trim() : 'Untitled';
    };

    const getTabLabel = (doc) => doc.name !== null ? doc.name : getAutoName(doc.content);

    let docs = [];
    let activeDocId = null;

    const persistDocs = () => {
        const expiredAt = new Date(2099, 1, 1);
        const toSave = docs.map(({ id, name, content }) => ({ id, name, content }));
        Storehouse.setItem(localStorageNamespace, DOCS_KEY, toSave, expiredAt);
        Storehouse.setItem(localStorageNamespace, ACTIVE_DOC_KEY, activeDocId, expiredAt);
    };

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

    const initDocModels = () => {
        docs.forEach(doc => {
            doc.model = monaco.editor.createModel(doc.content, 'markdown');
        });
    };

    const switchToDoc = (id) => {
        const doc = docs.find(d => d.id === id);
        if (!doc) return;
        activeDocId = id;
        editor.setModel(doc.model);
        convert(doc.model.getValue());
        renderTabs(); // defined in Task 4 — forward reference is fine
        persistDocs();
    };

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
                closeDoc(doc.id); // defined in Task 5 — forward reference
            });

            label.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                startRename(tab, doc); // defined in Task 6 — forward reference
            });
        });

        addBtn.disabled = docs.length >= MAX_TABS;
    };

    const addNewDoc = () => {
        if (docs.length >= MAX_TABS) return;
        const doc = createDoc('');
        doc.model = monaco.editor.createModel('', 'markdown');
        docs.push(doc);
        switchToDoc(doc.id);
    };

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

    self.MonacoEnvironment = {
        getWorker(_, label) {
            return new Proxy({}, { get: () => () => { } });
        }
    }

    let setupEditor = () => {
        let editor = monaco.editor.create(document.querySelector('#editor'), {
            fontSize: 14,
            language: 'markdown',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            scrollbar: {
                vertical: 'visible',
                horizontal: 'visible'
            },
            wordWrap: 'on',
            hover: { enabled: false },
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            folding: false
        });

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

        editor.onDidScrollChange((e) => {
            if (!scrollBarSync) {
                return;
            }

            const scrollTop = e.scrollTop;
            const scrollHeight = e.scrollHeight;
            const height = editor.getLayoutInfo().height;

            const maxScrollTop = scrollHeight - height;
            const scrollRatio = scrollTop / maxScrollTop;

            let previewElement = document.querySelector('#preview');
            let targetY = (previewElement.scrollHeight - previewElement.clientHeight) * scrollRatio;
            previewElement.scrollTo(0, targetY);
        });

        return editor;
    };

    let escapeHtml = (value) => {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    let createMarkedRenderer = () => {
        const renderer = new marked.Renderer();
        const renderCode = renderer.code.bind(renderer);

        renderer.code = (token) => {
            const lang = (token.lang || '').match(/^\S*/)?.[0].toLowerCase();
            if (lang !== 'mermaid') {
                return renderCode(token);
            }

            return `<pre class="mermaid">${escapeHtml(token.text)}</pre>\n`;
        };

        return renderer;
    };

    let configureMermaid = (theme) => {
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme
        });
    };

    let showMermaidError = (element, error) => {
        const message = error && error.message ? error.message : 'Unable to render Mermaid chart.';
        element.classList.add('mermaid-error');
        element.textContent = `Mermaid render error: ${message}`;
    };

    let getMermaidTheme = () => {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
    };

    let renderMermaidDiagramsNow = async (theme = getMermaidTheme()) => {
        const outputElement = document.querySelector('#output');
        if (!outputElement) {
            return;
        }

        const version = ++mermaidRenderVersion;
        configureMermaid(theme);

        const elements = Array.from(outputElement.querySelectorAll('.mermaid'));
        for (const [index, element] of elements.entries()) {
            if (version !== mermaidRenderVersion) {
                return;
            }

            const source = element.dataset.mermaidSource || element.textContent;
            element.dataset.mermaidSource = source;
            element.classList.remove('mermaid-error');

            try {
                const renderId = `mermaid-${Date.now()}-${version}-${index}`;
                const { svg, bindFunctions } = await mermaid.render(renderId, source);
                if (version !== mermaidRenderVersion) {
                    return;
                }
                element.innerHTML = svg;
                if (typeof bindFunctions === 'function') {
                    bindFunctions(element);
                }
            } catch (error) {
                showMermaidError(element, error);
            }
        }
    };

    let scheduleMermaidRender = () => {
        if (mermaidRenderTimer) {
            clearTimeout(mermaidRenderTimer);
        }

        mermaidRenderTimer = setTimeout(() => {
            mermaidRenderTimer = null;
            renderMermaidDiagramsNow();
        }, 150);
    };

    let renderMermaidDiagrams = (theme) => {
        if (mermaidRenderTimer) {
            clearTimeout(mermaidRenderTimer);
            mermaidRenderTimer = null;
        }

        return renderMermaidDiagramsNow(theme);
    };

    let renderer = createMarkedRenderer();

    // Render markdown text as html
    let convert = (markdown) => {
        let options = {
            headerIds: false,
            mangle: false,
            renderer
        };
        let html = marked.parse(markdown, options);
        let sanitized = DOMPurify.sanitize(html);
        document.querySelector('#output').innerHTML = sanitized;
        scheduleMermaidRender();
    };

    // Reset input text
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

    let presetValue = (value) => {
        editor.setValue(value);
        editor.revealPosition({ lineNumber: 1, column: 1 });
        editor.focus();
        hasEdited = false;
    };

    // ----- sync scroll position -----

    let initScrollBarSync = (settings) => {
        let checkbox = document.querySelector('#sync-scroll-checkbox');
        checkbox.checked = settings;
        scrollBarSync = settings;

        checkbox.addEventListener('change', (event) => {
            let checked = event.currentTarget.checked;
            scrollBarSync = checked;
            saveScrollBarSettings(checked);
        });
    };

    // ----- preview CSS loader (switch github-markdown css) -----
    const PREVIEW_CSS_LIGHT = 'css/github-markdown-light.css?v=1.11.0';
    const PREVIEW_CSS_DARK = 'css/github-markdown-dark_dimmed.css?v=1.11.0';

    let setPreviewCss = (useDark) => {
        const link = document.getElementById('gh-markdown-link');
        if (!link) {
            // fallback: create link element
            const newLink = document.createElement('link');
            newLink.id = 'gh-markdown-link';
            newLink.rel = 'stylesheet';
            newLink.href = useDark ? PREVIEW_CSS_DARK : PREVIEW_CSS_LIGHT;
            document.head.appendChild(newLink);
            return;
        }

        // Only update if href differs to avoid unnecessary reload
        const desired = useDark ? PREVIEW_CSS_DARK : PREVIEW_CSS_LIGHT;
        if (link.getAttribute('href') !== desired) {
            link.setAttribute('href', desired);
        }
    };

    // ----- theme toggle (dark/light) -----
    let setTheme = (enabled) => {
        document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
    };

    let initThemeToggle = (settings) => {
        let checkbox = document.querySelector('#theme-checkbox');
        if (!checkbox) return;
        checkbox.checked = settings;
        setTheme(settings);

        // set Monaco editor theme to match page theme
        if (monaco && monaco.editor && typeof monaco.editor.setTheme === 'function') {
            monaco.editor.setTheme(settings ? 'vs-dark' : 'vs');
        }
        // set preview css to match theme
        setPreviewCss(settings);

        checkbox.addEventListener('change', (event) => {
            let checked = event.currentTarget.checked;
            setTheme(checked);
            saveThemeSettings(checked);
            setPreviewCss(checked);
            if (monaco && monaco.editor && typeof monaco.editor.setTheme === 'function') {
                monaco.editor.setTheme(checked ? 'vs-dark' : 'vs');
            }
            renderMermaidDiagrams();
        });
    };

    let enableScrollBarSync = () => {
        scrollBarSync = true;
    };

    let disableScrollBarSync = () => {
        scrollBarSync = false;
    };

    // ----- clipboard utils -----

    let copyToClipboard = (text, successHandler, errorHandler) => {
        navigator.clipboard.writeText(text).then(
            () => {
                successHandler();
            },

            () => {
                errorHandler();
            }
        );
    };

    let notifyCopied = () => {
        let labelElement = document.querySelector("#copy-button a");
        labelElement.innerHTML = "Copied!";
        setTimeout(() => {
            labelElement.innerHTML = "Copy";
        }, 1000)
    };

    // ----- export preview -----

    let exportLightCssPromise = null;

    let getLightMarkdownCss = () => {
        if (exportLightCssPromise) {
            return exportLightCssPromise;
        }

        exportLightCssPromise = fetch(PREVIEW_CSS_LIGHT)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load export CSS: ${response.status}`);
                }
                return response.text();
            })
            .catch((error) => {
                // eslint-disable-next-line no-console
                console.error('Failed to load light markdown CSS', error);
                return '';
            });

        return exportLightCssPromise;
    };

    let exportPreviewToPdf = () => {
        const previewElement = document.querySelector('#preview-wrapper');
        if (!previewElement) {
            return;
        }

        if (typeof window.html2pdf !== 'function') {
            window.alert('PDF export is not available yet. Please try again in a moment.');
            return;
        }

        const restoreDarkMermaid = getMermaidTheme() === 'dark';

        renderMermaidDiagrams('default').then(() => getLightMarkdownCss()).then((lightCss) => {
            const options = {
                margin: 10,
                filename: 'markdown-preview.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    onclone: (clonedDoc) => {
                        clonedDoc.documentElement.setAttribute('data-theme', 'light');

                        const markdownLink = clonedDoc.getElementById('gh-markdown-link');
                        if (markdownLink) {
                            markdownLink.setAttribute('href', PREVIEW_CSS_LIGHT);
                        }

                        if (lightCss) {
                            const style = clonedDoc.createElement('style');
                            style.id = 'export-light-css';
                            style.textContent = `${lightCss}
#preview-wrapper, #output, body {
  background: #fff !important;
  color: #24292f !important;
}`;
                            clonedDoc.head.appendChild(style);
                        }

                        const clonedPreview = clonedDoc.getElementById('preview-wrapper');
                        if (clonedPreview) {
                            clonedPreview.style.background = '#fff';
                            clonedPreview.style.color = '#24292f';
                            clonedPreview.style.width = '190mm';
                            clonedPreview.style.maxWidth = '190mm';
                        }

                        const clonedOutput = clonedDoc.getElementById('output');
                        if (clonedOutput) {
                            clonedOutput.style.background = '#fff';
                            clonedOutput.style.color = '#24292f';
                            clonedOutput.style.width = '190mm';
                            clonedOutput.style.maxWidth = '190mm';
                        }
                    }
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            window.html2pdf()
                .set(options)
                .from(previewElement)
                .save()
                .catch((error) => {
                    // eslint-disable-next-line no-console
                    console.error('Failed to export PDF', error);
                })
                .finally(() => {
                    if (restoreDarkMermaid) {
                        renderMermaidDiagrams();
                    }
                });
        });
    };

    // ----- setup -----

    // setup navigation actions
    let setupResetButton = () => {
        document.querySelector("#reset-button").addEventListener('click', (event) => {
            event.preventDefault();
            reset();
        });
    };

    let setupCopyButton = (editor) => {
        document.querySelector("#copy-button").addEventListener('click', (event) => {
            event.preventDefault();
            let value = editor.getValue();
            copyToClipboard(value, () => {
                notifyCopied();
            },
                () => {
                    // nothing to do
                });
        });
    };

    let setupExportButton = () => {
        const exportButton = document.querySelector('#export-button');
        if (!exportButton) {
            return;
        }
        exportButton.addEventListener('click', (event) => {
            event.preventDefault();
            exportPreviewToPdf();
        });
    };

    // ----- local state -----

    let loadLastContent = () => {
        let lastContent = Storehouse.getItem(localStorageNamespace, localStorageKey);
        return lastContent;
    };

    let saveLastContent = (content) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageKey, content, expiredAt);
    };

    let loadScrollBarSettings = () => {
        let lastContent = Storehouse.getItem(localStorageNamespace, localStorageScrollBarKey);
        return lastContent;
    };

    let loadThemeSettings = () => {
        let last = Storehouse.getItem(localStorageNamespace, localStorageThemeKey);
        if (last === null || last === undefined) {
            try {
                // fallback to raw localStorage boot key used by inline script
                const raw = localStorage.getItem('com.markdownlivepreview_theme');
                if (raw === 'dark') return true;
                if (raw === 'light') return false;
            } catch (e) {
                // ignore
            }
        }
        return last;
    };

    let saveScrollBarSettings = (settings) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageScrollBarKey, settings, expiredAt);
    };

    let saveThemeSettings = (settings) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageThemeKey, settings, expiredAt);
        try {
            localStorage.setItem('com.markdownlivepreview_theme', settings ? 'dark' : 'light');
        } catch (e) {
            // ignore storage errors
        }
    };

    let setupDivider = () => {
        let lastLeftRatio = 0.5;
        const divider = document.getElementById('split-divider');
        const leftPane = document.getElementById('edit');
        const rightPane = document.getElementById('preview');
        const container = document.getElementById('container');

        let isDragging = false;

        divider.addEventListener('mouseenter', () => {
            divider.classList.add('hover');
        });

        divider.addEventListener('mouseleave', () => {
            if (!isDragging) {
                divider.classList.remove('hover');
            }
        });

        divider.addEventListener('mousedown', () => {
            isDragging = true;
            divider.classList.add('active');
            document.body.style.cursor = 'col-resize';
        });

        divider.addEventListener('dblclick', () => {
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const halfWidth = (totalWidth - dividerWidth) / 2;

            leftPane.style.width = halfWidth + 'px';
            rightPane.style.width = halfWidth + 'px';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            document.body.style.userSelect = 'none';
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const offsetX = e.clientX - containerRect.left;
            const dividerWidth = divider.offsetWidth;

            // Prevent overlap or out-of-bounds
            const minWidth = 100;
            const maxWidth = totalWidth - minWidth - dividerWidth;
            const leftWidth = Math.max(minWidth, Math.min(offsetX, maxWidth));
            leftPane.style.width = leftWidth + 'px';
            rightPane.style.width = (totalWidth - leftWidth - dividerWidth) + 'px';
            lastLeftRatio = leftWidth / (totalWidth - dividerWidth);
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                divider.classList.remove('active');
                divider.classList.remove('hover');
                document.body.style.cursor = 'default';
                document.body.style.userSelect = '';
            }
        });

        window.addEventListener('resize', () => {
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const availableWidth = totalWidth - dividerWidth;

            const newLeft = availableWidth * lastLeftRatio;
            const newRight = availableWidth * (1 - lastLeftRatio);

            leftPane.style.width = newLeft + 'px';
            rightPane.style.width = newRight + 'px';
        });
    };

    // ----- entry point -----
    initDocs();
    let editor = setupEditor();
    initDocModels();
    const activeDoc = docs.find(d => d.id === activeDocId);
    editor.setModel(activeDoc.model);
    convert(activeDoc.model.getValue());
    renderTabs();
    document.getElementById('add-tab-btn').addEventListener('click', addNewDoc);
    document.getElementById('undo-btn').addEventListener('click', undoClose);
    setupResetButton();
    setupCopyButton(editor);
    setupExportButton();

    let scrollBarSettings = loadScrollBarSettings() || false;
    initScrollBarSync(scrollBarSettings);

    // initialize theme (dark/light)
    let themeSettings = loadThemeSettings();
    // normalize to boolean (Storehouse may return string or boolean)
    if (themeSettings === 'true' || themeSettings === true) {
        themeSettings = true;
    } else {
        themeSettings = false;
    }
    initThemeToggle(themeSettings);

    setupDivider();
};

window.addEventListener("load", () => {
    init();
});
