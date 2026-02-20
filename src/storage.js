/**
 * TRPG写作工坊 — Storage Manager (IndexedDB + localStorage fallback)
 * Handles multi-file document management with auto-save
 */

const DB_NAME = 'trpg-writer-db';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

let db = null;

/**
 * Open (or create) the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
                store.createIndex('title', 'title', { unique: false });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };

        request.onerror = (e) => {
            console.error('IndexedDB error:', e);
            reject(e);
        };
    });
}

/**
 * Generate a unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a new blank document
 * @param {string} title
 * @returns {object}
 */
export function createDocument(title = '未命名文档') {
    return {
        id: generateId(),
        title,
        content: getDefaultContent(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pageStyle: 'parchment',
        customCSS: ''
    };
}

/**
 * Get default starter content (Chinese)
 */
function getDefaultContent() {
    return `# 欢迎使用TRPG写作工坊

这是一个中文化的、模块化的桌面角色扮演游戏模组编辑工具。

## 快速开始

在左侧编辑区域使用 **Markdown** 语法编写内容，右侧将实时显示预览效果。

### 支持的扩展语法

#### 提示框
\`\`\`
{{note
##### 提示标题
提示内容写在这里
}}
\`\`\`

#### 骰子
在文本中使用 \`[[2d6+3]]\` 来创建可点击的骰子按钮。

---

> *"冒险者们，准备好了吗？前方的道路充满了未知与危险。"*
> — 神秘的旅店老板

### 示例表格

| 等级 | 熟练加值 | 特性 |
|:----:|:--------:|:----:|
| 1    | +2       | 战斗风格 |
| 2    | +2       | 动作如潮 |
| 3    | +2       | 子职选择 |

---

祝您创作愉快！🎲
`;
}

/**
 * Save a document to IndexedDB
 * @param {object} doc
 * @returns {Promise<void>}
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
        // Fallback to localStorage
        const docs = JSON.parse(localStorage.getItem('trpg-docs') || '{}');
        doc.updatedAt = Date.now();
        docs[doc.id] = doc;
        localStorage.setItem('trpg-docs', JSON.stringify(docs));
    }
}

/**
 * Load a document by ID
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function loadDocument(id) {
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
 * Get all documents (sorted by updatedAt desc)
 * @returns {Promise<object[]>}
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
 * @param {string} id
 * @returns {Promise<void>}
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

/**
 * Save app preferences
 * @param {object} prefs
 */
export function savePreferences(prefs) {
    localStorage.setItem('trpg-prefs', JSON.stringify(prefs));
}

/**
 * Load app preferences
 * @returns {object}
 */
export function loadPreferences() {
    const defaults = {
        theme: 'dark',
        editorFontSize: 15,
        pageStyle: 'parchment',
        autoSave: true,
        sidebarExpanded: false,
        lastOpenFiles: [],
        activeFileId: null,
        editorWidth: null
    };
    try {
        const saved = JSON.parse(localStorage.getItem('trpg-prefs') || '{}');
        return { ...defaults, ...saved };
    } catch {
        return defaults;
    }
}

/**
 * Export document as formatted HTML file
 * @param {object} doc
 * @param {string} renderedHTML
 */
export function exportAsHTML(doc, renderedHTML) {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${doc.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700;900&family=Noto+Sans+SC:wght@300;400;500;600;700&family=ZCOOL+XiaoWei&display=swap" rel="stylesheet">
  <style>
    :root {
      --font-serif: 'Noto Serif SC', 'Georgia', serif;
      --font-sans: 'Noto Sans SC', 'Segoe UI', sans-serif;
      --font-display: 'ZCOOL XiaoWei', 'Noto Serif SC', serif;
      --font-mono: 'Cascadia Code', 'Consolas', monospace;
    }
    body { 
      font-family: var(--font-serif); 
      max-width: 850px; 
      margin: 0 auto; 
      padding: 48px 56px; 
      background: #fdf6e3; 
      color: #2c2416; 
      font-size: 15px; 
      line-height: 1.8; 
    }
    h1 { font-family: var(--font-display); font-size: 32px; color: #58180d; border-bottom: 4px solid #c9ad6a; padding-bottom: 6px; }
    h2 { font-family: var(--font-display); font-size: 24px; color: #58180d; border-bottom: 2px solid #c9ad6a; padding-bottom: 4px; }
    h3 { font-size: 19px; color: #58180d; border-bottom: 1px solid rgba(201,173,106,0.4); padding-bottom: 3px; }
    h4 { font-size: 16px; color: #58180d; font-style: italic; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px; }
    thead tr { background: #58180d; color: #fdf6e3; }
    th { padding: 8px 12px; font-weight: 600; text-align: left; }
    td { padding: 7px 12px; border-bottom: 1px solid rgba(201,173,106,0.3); }
    tbody tr:nth-child(even) { background: rgba(201,173,106,0.06); }
    blockquote { padding: 12px 20px; border-left: 4px solid #c9ad6a; background: rgba(201,173,106,0.08); font-style: italic; margin: 12px 0; }
    hr { border: none; height: 2px; background: linear-gradient(to right, transparent, #c9ad6a, transparent); margin: 20px 0; }
    code { font-family: var(--font-mono); background: rgba(88,24,13,0.06); padding: 2px 6px; border-radius: 3px; color: #702020; }
    pre { background: #2c2416; color: #fdf6e3; padding: 16px 20px; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; color: inherit; }
    .trpg-note { background: linear-gradient(135deg, #f0e4c8, #e8dbb8); border: 2px solid #c9ad6a; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .trpg-warning { background: linear-gradient(135deg, #4a1a1a, #3a1515); border: 2px solid #8b2500; border-radius: 8px; padding: 16px 20px; margin: 16px 0; color: #f0d0c0; }
    .trpg-stat-block { background: linear-gradient(to bottom, #fdf6e3, #f4e8cc); border-top: 3px solid #c9ad6a; border-bottom: 3px solid #c9ad6a; padding: 16px 20px; margin: 20px 0; }
    .trpg-spell { background: linear-gradient(135deg, #e8e0f0, #ddd6ea); border: 2px solid #7b68a8; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .trpg-item { background: linear-gradient(135deg, #e0eef0, #d0e4e8); border: 2px solid #4a8b9a; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .dice-roll { display: inline-flex; padding: 2px 10px; background: linear-gradient(135deg, #58180d, #702020); color: #fdf6e3; border-radius: 20px; font-weight: 600; font-size: 13px; }
    @media print { body { padding: 20mm 25mm; } }
    ${doc.customCSS || ''}
  </style>
</head>
<body>
${renderedHTML}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
