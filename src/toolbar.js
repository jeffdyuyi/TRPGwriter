/**
 * TRPG写作工坊 — Toolbar Actions
 * Maps toolbar button clicks to editor text insertions/wrappings
 */

/**
 * Get the selection info from a textarea
 * @param {HTMLTextAreaElement} editor 
 * @returns {{ start: number, end: number, selected: string, before: string, after: string }}
 */
function getSelection(editor) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    return {
        start,
        end,
        selected: editor.value.substring(start, end),
        before: editor.value.substring(0, start),
        after: editor.value.substring(end)
    };
}

/**
 * Replace the selection and re-focus
 * @param {HTMLTextAreaElement} editor 
 * @param {string} text 
 * @param {number} cursorStart 
 * @param {number} cursorEnd 
 */
function replaceSelection(editor, text, cursorStart, cursorEnd) {
    editor.focus();
    const { start, end, before, after } = getSelection(editor);
    editor.value = before + text + after;
    editor.selectionStart = cursorStart ?? (start + text.length);
    editor.selectionEnd = cursorEnd ?? editor.selectionStart;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Wrap selection with prefix/suffix or insert template
 * @param {HTMLTextAreaElement} editor 
 * @param {string} prefix 
 * @param {string} suffix 
 * @param {string} placeholder 
 */
function wrapSelection(editor, prefix, suffix, placeholder = '') {
    const { start, end, selected } = getSelection(editor);
    const text = selected || placeholder;
    const newText = prefix + text + suffix;
    replaceSelection(editor, newText, start + prefix.length, start + prefix.length + text.length);
}

/**
 * Insert text at cursor position
 * @param {HTMLTextAreaElement} editor 
 * @param {string} text 
 * @param {number} cursorOffset - offset from the end of inserted text
 */
function insertText(editor, text, cursorOffset = 0) {
    const { start, before, after } = getSelection(editor);
    editor.value = before + text + after;
    const pos = start + text.length + cursorOffset;
    editor.selectionStart = pos;
    editor.selectionEnd = pos;
    editor.focus();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Insert at beginning of each selected line
 * @param {HTMLTextAreaElement} editor
 * @param {string} prefix
 */
function prefixLines(editor, prefix) {
    const { start, end, selected } = getSelection(editor);
    if (!selected) {
        insertText(editor, prefix);
        return;
    }
    const lines = selected.split('\n').map(line => prefix + line);
    replaceSelection(editor, lines.join('\n'), start, start + lines.join('\n').length);
}

/**
 * Execute a toolbar action
 * @param {string} action - The action name from data-action
 * @param {HTMLTextAreaElement} editor - The editor textarea
 */
export function executeAction(action, editor) {
    switch (action) {
        case 'h1':
            wrapSelection(editor, '# ', '', '一级标题');
            break;
        case 'h2':
            wrapSelection(editor, '## ', '', '二级标题');
            break;
        case 'h3':
            wrapSelection(editor, '### ', '', '三级标题');
            break;
        case 'h4':
            wrapSelection(editor, '#### ', '', '四级标题');
            break;
        case 'bold':
            wrapSelection(editor, '**', '**', '粗体文本');
            break;
        case 'italic':
            wrapSelection(editor, '*', '*', '斜体文本');
            break;
        case 'strikethrough':
            wrapSelection(editor, '~~', '~~', '删除线文本');
            break;
        case 'highlight':
            wrapSelection(editor, '==', '==', '高亮文本');
            break;
        case 'ul':
            prefixLines(editor, '- ');
            break;
        case 'ol':
            prefixLines(editor, '1. ');
            break;
        case 'blockquote':
            prefixLines(editor, '> ');
            break;
        case 'hr':
            insertText(editor, '\n\n---\n\n');
            break;
        case 'code':
            wrapSelection(editor, '```\n', '\n```', '代码内容');
            break;
        case 'table':
            insertText(editor, `\n| 列1 | 列2 | 列3 |
|:-----|:----:|-----:|
| 内容 | 内容 | 内容 |
| 内容 | 内容 | 内容 |
\n`);
            break;
        case 'image':
            wrapSelection(editor, '![', '](https://图片URL)', '图片描述');
            break;
        case 'link':
            wrapSelection(editor, '[', '](https://链接URL)', '链接文本');
            break;
        case 'note':
            insertText(editor, `\n{{note
##### 提示标题
在此处编写提示内容。你可以使用任何Markdown语法。
}}\n`, -3);
            break;
        case 'warning':
            insertText(editor, `\n{{warning
##### 警告标题
在此处编写警告内容。
}}\n`, -3);
            break;
        case 'stat-block':
            insertText(editor, `\n{{stat-block
### 怪物名称
*中型 人形生物，守序邪恶*

---

**护甲等级** 16（锁子甲）
**生命值** 52（8d8 + 16）
**速度** 30尺

---

| 力量 | 敏捷 | 体质 | 智力 | 感知 | 魅力 |
|:----:|:----:|:----:|:----:|:----:|:----:|
| 16(+3) | 12(+1) | 14(+2) | 10(+0) | 11(+0) | 14(+2) |

---

**技能** 威吓 +4，运动 +5
**感官** 被动感知 10
**语言** 通用语
**挑战等级** 3（700 XP）

---

##### 特性名称
特性描述。

##### 动作
**多重攻击。** 描述多重攻击动作。

**长剑。** *近战武器攻击：* +5 命中，触及5尺，单个目标。*命中：* 7（1d8 + 3）挥砍伤害。
}}\n`);
            break;
        case 'spell':
            insertText(editor, `\n{{spell
##### 法术名称
*X环 学派*

**施法时间：** 1 动作
**射程：** 60尺
**成分：** 语言、姿势、材料（材料描述）
**持续时间：** 专注，至多1分钟

法术效果描述。

**升环施法。** 当你使用X环或更高环的法术位施放该法术时，效果增强描述。
}}\n`);
            break;
        case 'item':
            insertText(editor, `\n{{item
##### 物品名称
*武器（长剑），罕见（需要同调）*

该物品的描述和背景故事。

你对该武器的攻击和伤害检定获得+1加值。

**特殊能力。** 能力描述。
}}\n`);
            break;
        case 'dice-inline':
            wrapSelection(editor, '[[', ']]', '2d6+3');
            break;
        case 'page-break':
            insertText(editor, '\n\\page\n');
            break;
        case 'column-break':
            insertText(editor, '\n\\column\n');
            break;
        default:
            console.warn('Unknown action:', action);
    }
}

/**
 * Setup keyboard shortcuts for the editor
 * @param {HTMLTextAreaElement} editor 
 */
export function setupShortcuts(editor) {
    editor.addEventListener('keydown', (e) => {
        // Ctrl+B = Bold
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            executeAction('bold', editor);
        }
        // Ctrl+I = Italic
        if (e.ctrlKey && e.key === 'i') {
            e.preventDefault();
            executeAction('italic', editor);
        }
        // Ctrl+K = Link
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            executeAction('link', editor);
        }
        // Tab = insert 2 spaces
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                // TODO: outdent
            } else {
                insertText(editor, '  ');
            }
        }
    });
}
