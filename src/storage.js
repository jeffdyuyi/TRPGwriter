/**
 * TRPG写作工坊 — Storage Manager (IndexedDB + localStorage fallback)
 * Handles multi-file document management with auto-save
 */

const DB_NAME = 'trpg-writer-db';
const DB_VERSION = 3; // Bumped to add custom_data store
const STORE_NAME = 'documents';

let db = null;

/**
 * Open (or create) the IndexedDB database
 */
function openDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            // Delete old store if upgrading from v1
            if (e.oldVersion < 2 && database.objectStoreNames.contains(STORE_NAME)) {
                database.deleteObjectStore(STORE_NAME);
            }
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
                store.createIndex('title', 'title', { unique: false });
            }
            if (!database.objectStoreNames.contains('custom_data')) {
                // Store for imported CSV data
                const customStore = database.createObjectStore('custom_data', { keyPath: 'id', autoIncrement: true });
                customStore.createIndex('type', 'type', { unique: false });
                customStore.createIndex('source', 'source', { unique: false });
                customStore.createIndex('name', 'name', { unique: false });
            }
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(db); };
        request.onerror = (e) => { console.error('IndexedDB error:', e); reject(e); };
    });
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Initialize storage
 */
export async function initStorage() {
    try {
        await openDB();
    } catch (e) {
        console.warn('IndexedDB not available, using localStorage fallback');
    }
}

/**
 * Create a new document
 * @param {string} title
 * @param {string} content - HTML content
 * @returns {Promise<object>}
 */
export async function createDocument(title = '未命名文档', content = '') {
    const doc = {
        id: generateId(),
        title,
        content,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pageStyle: 'parchment'
    };
    await saveDocument(doc);
    return doc;
}

/**
 * Get a document by ID
 */
export async function getDocument(id) {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (e) => reject(e);
        });
    } catch (e) {
        const docs = JSON.parse(localStorage.getItem('trpg-docs') || '{}');
        return docs[id] || null;
    }
}

/**
 * Save a document
 */
export async function saveDocument(doc) {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            doc.updatedAt = Date.now();
            store.put(doc);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    } catch (e) {
        const docs = JSON.parse(localStorage.getItem('trpg-docs') || '{}');
        doc.updatedAt = Date.now();
        docs[doc.id] = doc;
        try {
            localStorage.setItem('trpg-docs', JSON.stringify(docs));
        } catch (err) {
            console.error('Storage full! Could not save to localStorage.', err);
            if (window.__showToast) window.__showToast('存储空间不足或不可用，保存失败！', 'error');
        }
    }
}

/**
 * Get all documents (sorted by updatedAt desc)
 */
export async function getAllDocuments() {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const docs = request.result || [];
                docs.sort((a, b) => b.updatedAt - a.updatedAt);
                resolve(docs);
            };
            request.onerror = (e) => reject(e);
        });
    } catch (e) {
        const docs = JSON.parse(localStorage.getItem('trpg-docs') || '{}');
        return Object.values(docs).sort((a, b) => b.updatedAt - a.updatedAt);
    }
}

/**
 * Delete a document by ID
 */
export async function deleteDocument(id) {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    } catch (e) {
        const docs = JSON.parse(localStorage.getItem('trpg-docs') || '{}');
        delete docs[id];
        try {
            localStorage.setItem('trpg-docs', JSON.stringify(docs));
        } catch (err) {
            console.error('Extremly unlikely fail: Could not update localStorage after delete.', err);
        }
    }
}

// ---- Custom Data (CSV Import) ----

export async function addCustomItem(item) {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction('custom_data', 'readwrite');
            const store = tx.objectStore('custom_data');
            // Check if exists by name+type to avoid dupes? Or just add?
            // Simple add for now
            store.add(item);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    } catch (e) {
        console.warn('DB not ready', e);
    }
}

export async function clearCustomItems(type) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction('custom_data', 'readwrite');
        const store = tx.objectStore('custom_data');
        const index = store.index('type');
        const request = index.openCursor(IDBKeyRange.only(type));

        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = reject;
    });
}

export async function searchCustomItems(type, query) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction('custom_data', 'readonly');
        const store = tx.objectStore('custom_data');
        const index = store.index('type');
        const request = index.getAll(IDBKeyRange.only(type));

        request.onsuccess = () => {
            const results = request.result || [];
            if (!query) return resolve(results);

            const term = query.toLowerCase();
            const filtered = results.filter(i =>
                (i.name && i.name.toLowerCase().includes(term)) ||
                (i.ENG_name && i.ENG_name.toLowerCase().includes(term))
            );
            resolve(filtered);
        };
        request.onerror = reject;
    });
}

// ---- Preferences ----

export function savePreferences(prefs) {
    localStorage.setItem('trpg-prefs', JSON.stringify(prefs));
}

export function loadPreferences() {
    const defaults = {
        theme: 'dark',
        pageStyle: 'parchment',
        autoSave: true,
        margins: { top: 35, bottom: 30, left: 25.4, right: 25.4 },
    };
    try {
        const saved = JSON.parse(localStorage.getItem('trpg-prefs') || '{}');
        return { ...defaults, ...saved };
    } catch {
        return defaults;
    }
}

// ---- Export ----

/**
 * Export a document as a standalone HTML file
 * @param {object} doc
 * @returns {string} HTML string
 */
export function exportToHTML(doc) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${doc.title || 'TRPG文档'}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700;900&family=Noto+Sans+SC:wght@300;400;500;600;700&family=ZCOOL+XiaoWei&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Noto Serif SC', serif;
      max-width: 210mm;
      margin: 0 auto;
      padding: 40px 50px;
      background: linear-gradient(135deg, #fdf6e3 0%, #f5e6c8 50%, #fdf6e3 100%);
      color: #333;
      font-size: 15px;
      line-height: 1.7;
    }
    h1, h2, h3 { font-family: 'ZCOOL XiaoWei', serif; color: #58180d; }
    h1 { border-bottom: 3px solid #c9ad6a; padding-bottom: 4px; }
    h2 { border-bottom: 2px solid #c9ad6a; padding-bottom: 3px; }
    h3 { border-bottom: 1px solid #c9ad6a; }
    h4 { color: #58180d; font-style: italic; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #58180d; color: #fff; padding: 6px 10px; text-align: left; }
    td { padding: 5px 10px; border-bottom: 1px solid #c9ad6a; }
    tr:nth-child(even) td { background: rgba(201,173,106,0.08); }
    blockquote { border-left: 4px solid #c9ad6a; padding: 8px 16px; background: rgba(201,173,106,0.12); font-style: italic; }
    hr { border: none; border-top: 2px solid #c9ad6a; margin: 1em 0; }
    img { max-width: 100%; }
    code { background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 3px; font-family: Consolas, monospace; }
    pre { background: rgba(0,0,0,0.06); padding: 12px 16px; border-radius: 4px; overflow-x: auto; }
    .trpg-note { background: #f5ecd7; border-left: 4px solid #c9ad6a; padding: 12px 16px; margin: 12px 0; border-radius: 0 6px 6px 0; }
    .trpg-note::before { content: '📜 提示'; display: block; font-weight: 700; color: #7c6420; margin-bottom: 4px; font-size: 0.85em; }
    .trpg-warning { background: #fdf0e8; border-left: 4px solid #e74c3c; padding: 12px 16px; margin: 12px 0; border-radius: 0 6px 6px 0; }
    .trpg-warning::before { content: '⚠️ 警告'; display: block; font-weight: 700; color: #c0392b; margin-bottom: 4px; font-size: 0.85em; }
    .trpg-generic-block { margin: 16px 0; padding: 4px 0; background: transparent; }
    .trpg-generic-block h3.generic-title { font-family: 'Noto Serif SC', serif; color: #7a200d; font-size: 1.4em; font-weight: 700; margin: 0 0 4px 0; border: none; }
    .trpg-generic-block hr.generic-divider { border: 0; height: 1px; background-color: #b0a79a; margin: 4px 0 6px 0; }
    .trpg-generic-block p.generic-subtitle { font-style: italic; font-size: 0.95em; margin: 0 0 8px 0; color: #444; }
    .trpg-generic-block p.generic-body { text-indent: 2em; margin: 6px 0; line-height: 1.6; }
    .trpg-stat-block { background: linear-gradient(180deg, #fdf6e3, #f5e6c8); border: 2px solid #58180d; padding: 16px 20px; margin: 16px 0; font-size: 0.92em; }
    .trpg-stat-block::before, .trpg-stat-block::after { content: ''; display: block; height: 6px; background: linear-gradient(90deg, #58180d 0%, #c9ad6a 45%, #c9ad6a 55%, #58180d 100%); margin: 4px -20px 8px; }
    .trpg-stat-block::after { margin: 8px -20px 4px; }
    .trpg-stat-block h3 { color: #58180d; font-size: 1.4em; border: none; }
    .trpg-stat-block table th { background: transparent; color: #58180d; text-align: center; border-bottom: 2px solid #58180d; }
    .trpg-stat-block table td { text-align: center; border: none; background: transparent; }
    .trpg-coc-stat-block { background: #f7f3ed; border-top: 4px solid #4a5445; border-bottom: 4px solid #4a5445; padding: 16px 20px; margin: 16px 0; font-size: 0.95em; color: #333; }
    .trpg-coc-stat-block h3 { font-size: 1.4em; margin: 0 0 10px; font-weight: 700; color: #333; border: none; }
    .trpg-coc-stat-block table { width: 100%; margin: 10px 0; border-collapse: collapse; }
    .trpg-coc-stat-block table th { text-align: left; background: transparent; color: #4a5445; border-bottom: none; }
    .trpg-coc-stat-block table td { text-align: left; border: none; }
    .trpg-coc-stat-block .stat-indent { margin: 4px 0 4px 1.5em; text-indent: -1.5em; }
    .trpg-coc-spell-card { padding: 10px 16px; margin: 12px 0; background: transparent; }
    .trpg-coc-spell-card h3 { color: #333; font-size: 1.25em; margin: 0 0 6px; font-weight: 700; border: none; }
    .trpg-coc-spell-card .coc-spell-meta { font-size: 0.95em; color: #333; margin: 4px 0; }
    .trpg-coc-spell-card .coc-spell-desc { font-size: 0.95em; color: #333; margin: 8px 0; text-indent: 2em; }
    .trpg-spell-card { background: #f8f0ff; border: 1px solid #9b59b6; border-top: 3px solid #9b59b6; border-radius: 6px; padding: 14px 18px; margin: 12px 0; }
    .trpg-spell-card h4 { color: #6c3483; font-style: normal; border: none; }
    .trpg-item-card { background: #f8fff5; border: 1px solid #27ae60; border-top: 3px solid #27ae60; border-radius: 6px; padding: 14px 18px; margin: 12px 0; }
    .trpg-item-card h4 { color: #1e8449; font-style: normal; border: none; }
    .dice-inline { background: #58180d; color: #fdf6e3; padding: 1px 8px; border-radius: 4px; font-size: 0.88em; font-weight: 600; }
    .page-break { page-break-after: always; break-after: page; border: none; height: 0; margin: 0; }
    @media print { body { padding: 20mm 25mm; } .page-break { page-break-after: always; } }
  </style>
</head>
<body>
${doc.content}
</body>
</html>`;
}

/**
 * Export a document as a well-formatted Markdown file
 * Converts HTML content from WYSIWYG editor into clean Markdown
 * @param {object} doc
 * @returns {string} Markdown string
 */
export function exportToMarkdown(doc) {
    const container = document.createElement('div');
    container.innerHTML = doc.content || '';

    // Build title
    let md = '';
    if (doc.title) {
        md += `# ${doc.title}\n\n`;
    }

    md += convertNodeToMarkdown(container);

    // Clean up: collapse 3+ newlines to 2
    md = md.replace(/\n{3,}/g, '\n\n');
    // Trim trailing whitespace on each line
    md = md.split('\n').map(l => l.trimEnd()).join('\n');
    // Ensure file ends with single newline
    md = md.trimEnd() + '\n';
    return md;
}

/**
 * Recursively convert an HTML node to Markdown text
 */
function convertNodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
    }

    const tag = node.tagName.toLowerCase();

    // --- TRPG Special Blocks ---
    if (node.classList.contains('trpg-note')) {
        const inner = convertChildrenToMarkdown(node).trim();
        return `\n> **📜 提示**\n>\n${inner.split('\n').map(l => `> ${l}`).join('\n')}\n\n`;
    }
    if (node.classList.contains('trpg-warning')) {
        const inner = convertChildrenToMarkdown(node).trim();
        return `\n> **⚠️ 警告**\n>\n${inner.split('\n').map(l => `> ${l}`).join('\n')}\n\n`;
    }
    if (node.classList.contains('trpg-stat-block')) {
        return convertStatBlock(node);
    }
    if (node.classList.contains('trpg-coc-stat-block')) {
        return convertStatBlock(node);
    }
    if (node.classList.contains('trpg-spell-card')) {
        return convertCardBlock(node, '🔮 法术');
    }
    if (node.classList.contains('trpg-coc-spell-card')) {
        return convertCardBlock(node, '📖 COC法术');
    }
    if (node.classList.contains('trpg-item-card')) {
        return convertCardBlock(node, '🛡️ 物品');
    }
    if (node.classList.contains('trpg-generic-block')) {
        const inner = convertChildrenToMarkdown(node).trim();
        return `\n${inner}\n\n`;
    }

    // --- Inline dice ---
    if (node.classList.contains('dice-inline')) {
        const formula = node.dataset.dice || node.textContent;
        return `\`🎲${formula}\``;
    }

    // --- Page break ---
    if (node.classList.contains('page-break')) {
        return '\n\n---\n*\\[分页\\]*\n\n---\n\n';
    }

    // --- Standard block elements ---
    switch (tag) {
        case 'h1': return `\n# ${convertChildrenToMarkdown(node).trim()}\n\n`;
        case 'h2': return `\n## ${convertChildrenToMarkdown(node).trim()}\n\n`;
        case 'h3': return `\n### ${convertChildrenToMarkdown(node).trim()}\n\n`;
        case 'h4': return `\n#### ${convertChildrenToMarkdown(node).trim()}\n\n`;
        case 'h5': return `\n##### ${convertChildrenToMarkdown(node).trim()}\n\n`;
        case 'h6': return `\n###### ${convertChildrenToMarkdown(node).trim()}\n\n`;

        case 'p': {
            const inner = convertChildrenToMarkdown(node).trim();
            if (!inner) return '\n';
            return `\n${inner}\n\n`;
        }

        case 'br':
            return '  \n';

        case 'hr':
            return '\n---\n\n';

        case 'strong':
        case 'b': {
            const inner = convertChildrenToMarkdown(node);
            return `**${inner.trim()}**`;
        }

        case 'em':
        case 'i': {
            const inner = convertChildrenToMarkdown(node);
            return `*${inner.trim()}*`;
        }

        case 'u': {
            const inner = convertChildrenToMarkdown(node);
            return `<u>${inner}</u>`;
        }

        case 'del':
        case 's':
        case 'strike': {
            const inner = convertChildrenToMarkdown(node);
            return `~~${inner.trim()}~~`;
        }

        case 'code': {
            return `\`${node.textContent}\``;
        }

        case 'pre': {
            const codeEl = node.querySelector('code');
            const text = codeEl ? codeEl.textContent : node.textContent;
            return `\n\`\`\`\n${text}\n\`\`\`\n\n`;
        }

        case 'blockquote': {
            const inner = convertChildrenToMarkdown(node).trim();
            return '\n' + inner.split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
        }

        case 'a': {
            const href = node.getAttribute('href') || '';
            const text = convertChildrenToMarkdown(node);
            return `[${text.trim()}](${href})`;
        }

        case 'img': {
            const src = node.getAttribute('src') || '';
            const alt = node.getAttribute('alt') || '图片';
            // Skip base64 images in Markdown (too long), just note them
            if (src.startsWith('data:')) {
                return `![${alt}](嵌入图片)`;
            }
            return `![${alt}](${src})`;
        }

        case 'ul':
            return '\n' + convertListItems(node, 'ul') + '\n';

        case 'ol':
            return '\n' + convertListItems(node, 'ol') + '\n';

        case 'li': {
            const inner = convertChildrenToMarkdown(node).trim();
            return inner;
        }

        case 'table':
            return '\n' + convertTableToMarkdown(node) + '\n';

        case 'div': {
            // Generic div — just convert children
            return convertChildrenToMarkdown(node);
        }

        case 'span': {
            // Check for dice-inline (already handled above by class)
            return convertChildrenToMarkdown(node);
        }

        case 'font': {
            return convertChildrenToMarkdown(node);
        }

        default:
            return convertChildrenToMarkdown(node);
    }
}

function convertChildrenToMarkdown(node) {
    let out = '';
    for (const child of node.childNodes) {
        out += convertNodeToMarkdown(child);
    }
    return out;
}

/**
 * Convert <ul> or <ol> list items to Markdown
 */
function convertListItems(listNode, type, depth = 0) {
    const indent = '  '.repeat(depth);
    let out = '';
    let idx = 1;
    for (const child of listNode.children) {
        if (child.tagName.toLowerCase() === 'li') {
            const prefix = type === 'ol' ? `${idx}. ` : '- ';
            // Check for nested lists inside li
            const nestedUl = child.querySelector(':scope > ul');
            const nestedOl = child.querySelector(':scope > ol');
            // Get text content excluding nested lists
            let innerText = '';
            for (const liChild of child.childNodes) {
                if (liChild.nodeType === Node.ELEMENT_NODE) {
                    const t = liChild.tagName.toLowerCase();
                    if (t === 'ul' || t === 'ol') continue;
                }
                innerText += convertNodeToMarkdown(liChild);
            }
            out += `${indent}${prefix}${innerText.trim()}\n`;
            if (nestedUl) {
                out += convertListItems(nestedUl, 'ul', depth + 1);
            }
            if (nestedOl) {
                out += convertListItems(nestedOl, 'ol', depth + 1);
            }
            idx++;
        }
    }
    return out;
}

/**
 * Convert an HTML <table> to Markdown table format
 */
function convertTableToMarkdown(tableNode) {
    const rows = [];
    const allTr = tableNode.querySelectorAll('tr');

    for (const tr of allTr) {
        const cells = [];
        for (const cell of tr.children) {
            if (cell.tagName === 'TH' || cell.tagName === 'TD') {
                cells.push(convertChildrenToMarkdown(cell).trim().replace(/\|/g, '\\|'));
            }
        }
        rows.push(cells);
    }

    if (rows.length === 0) return '';

    // Determine column widths
    const colCount = Math.max(...rows.map(r => r.length));

    // Normalize rows to have the same number of columns
    for (const row of rows) {
        while (row.length < colCount) row.push('');
    }

    // Build table
    let out = '';
    const header = rows[0];
    out += '| ' + header.join(' | ') + ' |\n';
    out += '| ' + header.map(() => '---').join(' | ') + ' |\n';
    for (let i = 1; i < rows.length; i++) {
        out += '| ' + rows[i].join(' | ') + ' |\n';
    }

    return out;
}

/**
 * Convert a TRPG stat block to Markdown
 */
function convertStatBlock(node) {
    let out = '\n---\n\n';
    out += convertChildrenToMarkdown(node).trim();
    out += '\n\n---\n\n';
    return out;
}

/**
 * Convert a TRPG card block (spell/item) to Markdown
 */
function convertCardBlock(node, prefix) {
    let out = '\n---\n\n';
    const inner = convertChildrenToMarkdown(node).trim();
    out += inner;
    out += '\n\n---\n\n';
    return out;
}
