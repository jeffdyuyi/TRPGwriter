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

    'coc-stat': `<div class="trpg-coc-stat-block" contenteditable="true">
    <h3>拜亚基，星骏</h3>
    <table class="coc-stat-table">
      <thead><tr><th>属性</th><th>平均</th><th>掷骰</th></tr></thead>
      <tbody>
        <tr><td>STR</td><td>90</td><td>(5D6×5)</td></tr>
        <tr><td>CON</td><td>50</td><td>(3D6×5)</td></tr>
        <tr><td>SIZ</td><td>90</td><td>(5D6×5)</td></tr>
        <tr><td>DEX</td><td>67</td><td>(3D6+3×5)</td></tr>
        <tr><td>INT</td><td>50</td><td>(3D6×5)</td></tr>
        <tr><td>POW</td><td>50</td><td>(3D6×5)</td></tr>
      </tbody>
    </table>
    <p class="stat-line">HP：14</p>
    <p class="stat-line">平均伤害加值：1D6</p>
    <p class="stat-line">平均体格：2</p>
    <p class="stat-line">平均魔法值：10</p>
    <p class="stat-line">移动：5/16 飞行</p>
    
    <h4>攻击</h4>
    <p class="stat-line">每回合攻击：2次</p>
    <p class="stat-indent">战斗方式：拜亚基会用爪子攻击或撞击受害者，造成严重伤害</p>
    <p class="stat-indent">格斗 55% (27/11)，伤害1D6+DB</p>
    <p class="stat-indent">闪避 33% (16/6)</p>
    <p class="stat-indent">护甲：2毛发与坚韧兽皮</p>
    <p class="stat-indent">技能：聆听50%，侦查50%</p>
    <p class="stat-indent">理智损失：直视拜亚基丧失1/1D6点理智。</p>
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

    'coc-spell': `<div class="trpg-coc-spell-card" contenteditable="true">
    <h3>尼约格萨紧握术</h3>
    <p class="coc-spell-meta">消耗：1+点魔法值、等于该轮中伤害值的两倍；1D20点理智值</p>
    <p class="coc-spell-meta">施法用时：即时</p>
    <p class="coc-spell-desc">施法者须消耗1点魔法值启动法术，目标必须在能够交谈的距离之内。施法者须和目标进行一次POW对抗检定并胜出，法术才能生效。如果施法者胜出，目标会感觉似乎有一只巨手或者触手挤压着他的心脏，在法术生效期间每轮损失1D3点耐久值。在受到这种攻击时，目标会暂时瘫痪，好像心脏病发作了一样。如果某轮中累计伤害使得目标的耐久归零，目标的胸口将破裂炸开，他冒着热气的心脏会出现在施法者的手中。</p>
    <p class="coc-spell-desc">法术每持续一轮，施法者就需要消耗两倍于（此轮中）耐久伤害的魔法值。施法者每轮都必须专心施法以维持效果，并且每轮都要和目标做一次POW对抗检定并胜出。如果施法者无法集中精力、或者目标POW抵抗成功，法术终止。已经造成的伤害仍保留。</p>
    <p class="coc-spell-desc" style="text-indent: 0; padding-left: 2em;">别名：邪恶的扭绞、黑暗巫师的暗中暴怒、可怖之抓挠</p>
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
        case 'coc-stat':
        case 'spell':
        case 'coc-spell':
        case 'item':
            insertHTML(TEMPLATES[action] + '<p style="font-weight:normal; font-style:normal; text-decoration:none; color:inherit;">&#8203;</p>');
            break;

        case 'dice-inline': {
            const formula = prompt('输入骰子公式（如 1d20, 2d6+3, 4d6kh3）:', '1d20');
            if (formula) {
                const html = `<span class="dice-inline" data-dice="${escapeAttr(formula)}" contenteditable="false">${escapeHtml(formula)}</span>&#8203;`;
                insertHTML(html);
            }
            break;
        }

        // Page layout
        case 'toggle-columns':
            editorEl.classList.toggle('two-columns');
            break;

        case 'page-break':
            insertHTML('<hr class="page-break"><p style="font-weight:normal; font-style:normal; text-decoration:none; color:inherit;">&#8203;</p>');
            break;

        case 'column-break':
            insertHTML('<hr class="column-break"><p style="font-weight:normal; font-style:normal; text-decoration:none; color:inherit;">&#8203;</p>');
            break;

        case 'hr':
            insertHTML('<hr><p style="font-weight:normal; font-style:normal; text-decoration:none; color:inherit;">&#8203;</p>');
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
    html += '</tbody></table><p style="font-weight:normal; font-style:normal; text-decoration:none; color:inherit;">&#8203;</p>';
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
