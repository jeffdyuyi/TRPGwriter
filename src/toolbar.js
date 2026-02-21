/**
 * TRPG写作工坊 — Toolbar Actions (WYSIWYG)
 * Uses document.execCommand and Selection API for contenteditable editing
 */

// ---- TRPG Element Templates ----

const TEMPLATES = {
    note: `<div class="trpg-note" contenteditable="true"><p>在此输入提示内容…</p></div>`,

    warning: `<div class="trpg-warning" contenteditable="true"><p>在此输入警告内容…</p></div>`,

    'stat-block': `<div class="trpg-stat-block" contenteditable="true">
    <h3>怪物名称</h3>
    <p class="stat-subtitle"><em>中型 人形生物，任意阵营</em></p>
    <p class="stat-line"><strong>护甲等级</strong> 12</p>
    <p class="stat-line"><strong>生命值</strong> 22 (5d8)</p>
    <p class="stat-line"><strong>速度</strong> 30尺</p>
    <table><thead><tr><th>力量</th><th>敏捷</th><th>体质</th><th>智力</th><th>感知</th><th>魅力</th></tr></thead>
    <tbody><tr><td>10(+0)</td><td>14(+2)</td><td>10(+0)</td><td>10(+0)</td><td>12(+1)</td><td>10(+0)</td></tr></tbody></table>
    <p class="stat-line"><strong>感官</strong> 被动感知 11</p>
    <p class="stat-line"><strong>语言</strong> 通用语</p>
    <p class="stat-line"><strong>挑战等级</strong> 1 (200 XP)</p>
    <p><strong><em>特性名称。</em></strong> 特性描述…</p>
    <h4>动作</h4>
    <p><strong><em>攻击名称。</em></strong> <em>近战武器攻击：</em>命中+4，触及5尺，单一目标。命中：5 (1d6+2) 挥砍伤害。</p>
  </div>`,

    spell: `<div class="trpg-spell-card" contenteditable="true">
    <h4>法术名称</h4>
    <p class="spell-meta">X环 XXX（仪式）</p>
    <p class="spell-props"><strong>施法时间：</strong>1 动作</p>
    <p class="spell-props"><strong>施法距离：</strong>60尺</p>
    <p class="spell-props"><strong>法术成分：</strong>V, S, M（材料描述）</p>
    <p class="spell-props"><strong>持续时间：</strong>专注，至多1分钟</p>
    <p>法术效果描述…</p>
  </div>`,

    item: `<div class="trpg-item-card" contenteditable="true">
    <h4>物品名称</h4>
    <p class="item-meta">魔法物品，稀有（需同调）</p>
    <p class="item-props"><strong>类型：</strong>武器（长剑）</p>
    <p>物品描述和效果…</p>
  </div>`,

    'dice-inline': `<span class="dice-inline" data-dice="1d20" contenteditable="false">1d20</span>`,
};

/**
 * Execute a toolbar action on the WYSIWYG editor
 * @param {string} action - The action identifier
 * @param {HTMLElement} editorEl - The contenteditable element
 */
export function executeToolbarAction(action, editorEl) {
    // Ensure focus is on the editor
    editorEl.focus();

    switch (action) {
        // TRPG elements — insert HTML templates
        case 'note':
        case 'warning':
        case 'stat-block':
        case 'spell':
        case 'item':
            insertHTML(TEMPLATES[action] + '<p><br></p>');
            break;

        case 'dice-inline': {
            const formula = prompt('输入骰子公式（如 1d20, 2d6+3, 4d6kh3）:', '1d20');
            if (formula) {
                const html = `<span class="dice-inline" data-dice="${escapeAttr(formula)}" contenteditable="false">${escapeHtml(formula)}</span>&nbsp;`;
                insertHTML(html);
            }
            break;
        }

        // Page layout
        case 'toggle-columns':
            editorEl.classList.toggle('two-columns');
            break;

        case 'page-break':
            insertHTML('<hr class="page-break"><p><br></p>');
            break;

        case 'column-break':
            insertHTML('<hr class="column-break"><p><br></p>');
            break;

        case 'hr':
            insertHTML('<hr><p><br></p>');
            break;

        // Insert elements
        case 'table': {
            const rows = parseInt(prompt('行数:', '3'), 10) || 3;
            const cols = parseInt(prompt('列数:', '3'), 10) || 3;
            insertHTML(buildTableHTML(rows, cols));
            break;
        }

        case 'link': {
            const href = prompt('输入链接URL:', 'https://');
            if (href && href !== 'https://') {
                const text = getSelectionText() || prompt('链接文本:', '链接') || '链接';
                insertHTML(`<a href="${escapeAttr(href)}" target="_blank">${escapeHtml(text)}</a>`);
            }
            break;
        }


        case 'blockquote':
            document.execCommand('formatBlock', false, 'blockquote');
            break;

        default:
            console.warn('Unknown toolbar action:', action);
    }
}

/**
 * Execute a format bar command
 * @param {string} cmd - The execCommand name
 */
export function executeFormatCommand(cmd) {
    document.execCommand(cmd, false, null);
}

/**
 * Apply a heading format from the block type select
 * @param {string} tag - The tag name (p, h1, h2, h3, h4)
 */
export function applyBlockFormat(tag) {
    document.execCommand('formatBlock', false, tag);
}

/**
 * Apply font family to the selection
 * @param {string} fontName
 */
export function applyFont(fontName) {
    document.execCommand('fontName', false, fontName);
}

/**
 * Apply text or background color
 * @param {string} color - CSS color value
 * @param {string} type - 'text' or 'bg'
 */
export function applyColor(color, type) {
    document.execCommand('foreColor', false, color);
}

// ---- Helpers ----

function insertHTML(html) {
    document.execCommand('insertHTML', false, html);
}

function getSelectionText() {
    const sel = window.getSelection();
    return sel ? sel.toString() : '';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildTableHTML(rows, cols) {
    let html = '<table><thead><tr>';
    for (let c = 0; c < cols; c++) html += `<th>标题${c + 1}</th>`;
    html += '</tr></thead><tbody>';
    for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) html += '<td>内容</td>';
        html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    return html;
}

// ---- Keyboard Shortcuts ----

export function setupKeyboardShortcuts(editorEl) {
    editorEl.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    document.execCommand('bold', false, null);
                    break;
                case 'i':
                    e.preventDefault();
                    document.execCommand('italic', false, null);
                    break;
                case 'u':
                    e.preventDefault();
                    document.execCommand('underline', false, null);
                    break;
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        document.execCommand('redo', false, null);
                    } else {
                        document.execCommand('undo', false, null);
                    }
                    break;
                case 'y':
                    e.preventDefault();
                    document.execCommand('redo', false, null);
                    break;
            }
        }
    });
}

/**
 * Detect current formatting state at cursor position
 * Returns an object of active states
 */
export function queryFormatState() {
    return {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
    };
}
