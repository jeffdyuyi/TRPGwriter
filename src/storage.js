/**
 * TRPG写作工坊 — Storage Manager (IndexedDB + localStorage fallback)
 * Handles multi-file document management with auto-save
 */

const DB_NAME = 'trpg-writer-db';
const DB_VERSION = 2; // Bumped to clear old Markdown data
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
        localStorage.setItem('trpg-docs', JSON.stringify(docs));
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
        localStorage.setItem('trpg-docs', JSON.stringify(docs));
    }
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
    .trpg-stat-block { background: linear-gradient(180deg, #fdf6e3, #f5e6c8); border: 2px solid #58180d; padding: 16px 20px; margin: 16px 0; font-size: 0.92em; }
    .trpg-stat-block::before, .trpg-stat-block::after { content: ''; display: block; height: 6px; background: linear-gradient(90deg, #58180d 0%, #c9ad6a 45%, #c9ad6a 55%, #58180d 100%); margin: 4px -20px 8px; }
    .trpg-stat-block::after { margin: 8px -20px 4px; }
    .trpg-stat-block h3 { color: #58180d; font-size: 1.4em; border: none; }
    .trpg-stat-block table th { background: transparent; color: #58180d; text-align: center; border-bottom: 2px solid #58180d; }
    .trpg-stat-block table td { text-align: center; border: none; background: transparent; }
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
