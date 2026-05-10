/**
 * TRPG写作工坊 — Main Application (WYSIWYG)
 * Orchestrates: editor, toolbar, dice, storage, settings
 */

import './style.css';
import { importer } from './modules/importer/importer.js';
import { Kiwee5ePlugin } from './modules/importer/plugins/kiwee5e.js';
import { CsvLocalPlugin } from './modules/importer/plugins/csv-local.js';
import { initImporterUI } from './modules/importer/importer-ui.js';
import {
  executeToolbarAction,
  executeFormatCommand,
  applyBlockFormat,
  applyFont,
  applyColor,
  setupKeyboardShortcuts,
  queryFormatState
} from './toolbar.js';
import { rollDice } from './dice.js';
import {
  initStorage,
  getAllDocuments,
  getDocument,
  saveDocument,
  createDocument,
  deleteDocument,
  loadPreferences,
  savePreferences,
  exportToHTML,
  exportToMarkdown,
  exportToJSON,
  exportToTXT,
  importFromJSON,
  importFromMarkdown,
  importFromTXT
} from './storage.js';

// =============================================
//  State
// =============================================
let state = {
  prefs: loadPreferences(),
  openFiles: [],
  activeFileIndex: -1,
  autoSaveTimer: null,
  colorMode: 'text' // 'text' or 'bg'
};

// =============================================
//  DOM References
// =============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const editor = $('#editor');
const editorScroll = $('#editor-scroll');
const fileTabs = $('#file-tabs');
const formatPanel = $('#format-panel');
const trpgPanel = $('#trpg-panel');

// =============================================
//  Initialization
// =============================================
async function init() {
  await initStorage();
  applyPreferences(state.prefs);
  setupKeyboardShortcuts(editor);
  setupEventListeners();
  initColorGrid();

  // Load files or create default
  const docs = await getAllDocuments();
  if (docs.length === 0) {
    await createNewFile();
  } else {
    // Open first doc
    const doc = docs[0];
    state.openFiles.push({ id: doc.id, doc, unsaved: false });
    state.activeFileIndex = 0;
    loadActiveFile();
    renderFileTabs();
  }

  // Initial layout update
  requestAnimationFrame(updatePageLayout);

  // Register Importer Plugins
  importer.register(new Kiwee5ePlugin());
  importer.register(new CsvLocalPlugin());
  // Initialize UI
  initImporterUI(importer);

  // Expose importer for debugging/console use
  window.importer = importer;
}

init();

// =============================================
//  Preferences
// =============================================
function applyPreferences(prefs) {
  // Theme
  document.documentElement.setAttribute('data-theme', prefs.theme || 'light');

  // Page style
  updatePageStyle(prefs.pageStyle || 'parchment');

  // Heading style
  updateHeadingStyle(prefs.headingStyle || 'classic');

  // Custom Styles
  updateCustomStylesCSS(prefs.customStyles);

  // Margins
  if (prefs.margins) {
    updatePageMargins(prefs.margins);
  }
}

function updatePageMargins(margins) {
  const editor = $('#editor');
  if (!editor) return;
  editor.style.setProperty('--page-pad-top', `${margins.top}mm`);
  editor.style.setProperty('--page-pad-bottom', `${margins.bottom}mm`);
  editor.style.setProperty('--page-pad-left', `${margins.left}mm`);
  editor.style.setProperty('--page-pad-right', `${margins.right}mm`);
}

function updateCustomStylesCSS(styles) {
  let styleEl = document.getElementById('custom-styles-sheet');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-styles-sheet';
    document.head.appendChild(styleEl);
  }
  if (!styles || styles.length === 0) {
    styleEl.innerHTML = '';
  } else {
    let css = '';
    styles.forEach(s => {
      css += `.wysiwyg-editor .cs-${s.id} { `;
      if (s.color) css += `color: ${s.color}; `;
      if (s.font) css += `font-family: ${s.font}; `;
      if (s.size) css += `font-size: ${s.size}; `;
      css += `}\n`;
    });
    styleEl.innerHTML = css;
  }
  renderCustomStylesSelect(styles);
}

function renderCustomStylesSelect(styles) {
  const select = $('#block-type-select');
  if (!select) return;
  // Remove existing custom options
  Array.from(select.options).forEach(opt => {
    if (opt.value.startsWith('cs-')) opt.remove();
  });
  // Add new styles
  (styles || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = `cs-${s.id}`;
    opt.textContent = s.name;
    opt.dataset.tag = s.tag;
    select.appendChild(opt);
  });
}

function updatePageStyle(style) {
  const wrapper = $('#editor-wrapper');
  ['page-parchment', 'page-modern', 'page-dark-fantasy'].forEach(c => wrapper.classList.remove(c));
  wrapper.classList.add(`page-${style}`);
}

function updateHeadingStyle(style) {
  const wrapper = $('#editor-wrapper');
  ['heading-classic', 'heading-modern', 'heading-gothic'].forEach(c => wrapper.classList.remove(c));
  wrapper.classList.add(`heading-${style}`);
}

function persistPreferences() {
  savePreferences(state.prefs);
}

// =============================================
//  File Tabs
// =============================================
function renderFileTabs() {
  fileTabs.innerHTML = '';
  state.openFiles.forEach((file, i) => {
    const tab = document.createElement('button');
    tab.className = `file-tab${i === state.activeFileIndex ? ' active' : ''}`;
    tab.innerHTML = `
      <span class="tab-name">${file.doc.title || '未命名'}</span>
      ${file.unsaved ? '<span class="unsaved-dot"></span>' : ''}
      <span class="tab-close material-symbols-rounded" style="font-size:14px">close</span>
    `;
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        closeFile(i);
      } else {
        switchToFile(i);
      }
    });
    // E2: 双击标签重命名
    const nameSpan = tab.querySelector('.tab-name');
    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const currentTitle = file.doc.title || '未命名';
      const newTitle = prompt('重命名文档:', currentTitle);
      if (newTitle !== null && newTitle.trim()) {
        file.doc.title = newTitle.trim();
        file.unsaved = true;
        renderFileTabs();
        scheduleAutoSave();
      }
    });
    fileTabs.appendChild(tab);
  });
}

function switchToFile(index) {
  if (index === state.activeFileIndex) return;
  saveCurrentToMemory();
  state.activeFileIndex = index;
  loadActiveFile();
  renderFileTabs();
}

function loadActiveFile() {
  const file = state.openFiles[state.activeFileIndex];
  if (!file) return;
  // V5: file switch fade-in animation
  editor.classList.remove('fade-in');
  void editor.offsetWidth; // force reflow
  editor.classList.add('fade-in');
  editor.innerHTML = file.doc.content || '';
  // Update layout after loading content - use double frame delay to ensure stability
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      updatePageLayout();
      updateStatusBar();
    });
  });
}

function saveCurrentToMemory() {
  const file = state.openFiles[state.activeFileIndex];
  if (!file) return;
  const content = editor.innerHTML;
  if (content !== file.doc.content) {
    file.doc.content = content;
    file.unsaved = true;
    renderFileTabs();
  }
}

async function closeFile(index) {
  const file = state.openFiles[index];
  if (file.unsaved) {
    const yes = confirm(`"${file.doc.title}" 有未保存的更改，是否保存？`);
    if (yes) {
      await saveDocument(file.doc);
    }
  }
  state.openFiles.splice(index, 1);
  if (state.openFiles.length === 0) {
    await createNewFile();
    return;
  }
  // B8: 正确调整激活索引
  if (index < state.activeFileIndex) {
    state.activeFileIndex--;
  } else if (index === state.activeFileIndex) {
    state.activeFileIndex = Math.min(state.activeFileIndex, state.openFiles.length - 1);
  }
  loadActiveFile();
  renderFileTabs();
}

async function createNewFile() {
  const doc = await createDocument('未命名文档', getDefaultContent());
  state.openFiles.push({ id: doc.id, doc, unsaved: false });
  state.activeFileIndex = state.openFiles.length - 1;
  loadActiveFile();
  renderFileTabs();
}

function getDefaultContent() {
  return `
<h1>幽暗城堡的秘密</h1>
<p><em>一个适合4-6名3级冒险者的单次冒险模组</em></p>

<blockquote>
<p><em>"城堡高塔上的光芒已经亮了三个夜晚，据说那里曾是一位强大巫师的居所。没有人敢靠近——除了你们。"</em></p>
<p style="text-align:right">— 碎石镇 · 布雷登旅店老板</p>
</blockquote>

<h2>冒险背景</h2>
<p>碎石镇东北方向两日路程的山谷中，矗立着一座被遗忘的古老城堡。近日，城堡塔顶突然亮起了诡异的<strong>紫色光芒</strong>，附近的森林中也开始出现不死生物的踪迹。镇上的长老<strong>艾拉·风语者</strong>希望一队冒险者前去调查此事。</p>

<div class="trpg-note">
<p><strong>给地下城主的提示：</strong>这个冒险可以作为更大战役的开端。城堡中的线索——巫师的日记和传送门——可以引导玩家发现更深层的阴谋。建议在冒险开始前与玩家讨论角色的动机和背景关联。</p>
</div>

<h2>第一幕：碎石镇</h2>
<p>冒险者们在<strong>布雷登旅店</strong>得知以下信息：</p>
<ul>
<li>城堡曾属于巫师<strong>马拉基·暗星</strong>，他在五十年前突然消失</li>
<li>最近有三名猎人在城堡附近失踪</li>
<li>有人报告看到了发光的骷髅在森林中游荡</li>
</ul>

<h3>任务奖励</h3>
<table>
<thead><tr><th>任务目标</th><th>奖励</th><th>备注</th></tr></thead>
<tbody>
<tr><td>调查城堡异变原因</td><td>200 gp</td><td>由长老支付</td></tr>
<tr><td>找到失踪猎人</td><td>100 gp / 人</td><td>猎人家属凑齐</td></tr>
<tr><td>消除不死生物威胁</td><td>150 gp</td><td>额外奖励</td></tr>
</tbody>
</table>

<h2>第二幕：城堡遭遇</h2>
<p>进入城堡后，冒险者在大厅遭遇守卫。投掷攻击：<span class="dice-inline" data-dice="1d20+4" contenteditable="false">1d20+4</span></p>

<div class="trpg-stat-block">
<h3>暗影骷髅</h3>
<p class="stat-subtitle"><em>中型 不死生物，混乱邪恶</em></p>
<p class="stat-line"><strong>护甲等级</strong> 13（残破护甲）</p>
<p class="stat-line"><strong>生命值</strong> 26 (4d8 + 8)</p>
<p class="stat-line"><strong>速度</strong> 30尺</p>
<table><thead><tr><th>力量</th><th>敏捷</th><th>体质</th><th>智力</th><th>感知</th><th>魅力</th></tr></thead>
<tbody><tr><td>14(+2)</td><td>16(+3)</td><td>15(+2)</td><td>6(-2)</td><td>8(-1)</td><td>5(-3)</td></tr></tbody></table>
<p class="stat-line"><strong>伤害免疫</strong> 毒素</p>
<p class="stat-line"><strong>状态免疫</strong> 力竭, 中毒</p>
<p class="stat-line"><strong>感官</strong> 黑暗视觉 60尺，被动感知 9</p>
<p class="stat-line"><strong>语言</strong> 能理解生前的语言但无法说话</p>
<p class="stat-line"><strong>挑战等级</strong> 1 (200 XP)</p>
<p><strong><em>暗影伪装。</em></strong> 骷髅在昏暗光照或黑暗中进行的敏捷（隐匿）检定具有优势。</p>
<h4>动作</h4>
<p><strong><em>黑曜石短剑。</em></strong> <em>近战武器攻击：</em>命中 <span class="dice-inline" data-dice="1d20+5" contenteditable="false">1d20+5</span>，触及5尺，单一目标。命中：<span class="dice-inline" data-dice="1d6+3" contenteditable="false">1d6+3</span> 穿刺伤害 外加 <span class="dice-inline" data-dice="1d4" contenteditable="false">1d4</span> 黯蚀伤害。</p>
<p><strong><em>死灵之弓。</em></strong> <em>远程武器攻击：</em>命中 <span class="dice-inline" data-dice="1d20+5" contenteditable="false">1d20+5</span>，射程 80/320尺，单一目标。命中：<span class="dice-inline" data-dice="1d8+3" contenteditable="false">1d8+3</span> 穿刺伤害。</p>
</div>

<div class="trpg-warning">
<p><strong>战斗平衡警告：</strong>如果团队缺少治疗职业，建议将暗影骷髅的数量从4个减少到2-3个，或将暗影伪装特性的优势改为普通骰。</p>
</div>

<h2>宝藏与魔法物品</h2>
<p>在巫师的书房中，冒险者找到了以下物品：</p>

<div class="trpg-item-card">
<h4>暗星法杖 +1</h4>
<p class="item-meta">武器（长棍），珍稀（需同调）</p>
<p class="item-props"><strong>类型：</strong>法术聚焦器</p>
<p class="item-props"><strong>属性：</strong>攻击和伤害骰 +1</p>
<p>这根漆黑的法杖顶端嵌有一颗缓缓旋转的紫色宝石。当你使用此法杖作为聚焦器施展法术时，法术豁免DC +1。此外，你可以使用一个附赠动作让宝石发出相当于火把的光芒，或熄灭它。</p>
<p><strong>暗星庇护（1/长休）。</strong> 当你受到黯蚀伤害时，你可以用反应动作消耗此能力，使该伤害减半。</p>
</div>

<h2>关键法术</h2>
<p>巫师马拉基在日记中提到了他最常使用的法术：</p>

<div class="trpg-spell-card">
<h4>暗影之触</h4>
<p class="spell-meta">1环 死灵学</p>
<p class="spell-props"><strong>施法时间：</strong>1 动作</p>
<p class="spell-props"><strong>施法距离：</strong>触及</p>
<p class="spell-props"><strong>法术成分：</strong>V, S</p>
<p class="spell-props"><strong>持续时间：</strong>立即</p>
<p>你的手上涌出暗影能量。对触及范围内一个生物进行近战法术攻击：<span class="dice-inline" data-dice="1d20+5" contenteditable="false">1d20+5</span>。命中时，目标受到 <span class="dice-inline" data-dice="3d6" contenteditable="false">3d6</span> 点黯蚀伤害，而你回复等同于造成伤害一半的生命值。</p>
<p><strong>升环施法：</strong>使用2环或更高法术位施展时，每高一环伤害增加 <span class="dice-inline" data-dice="1d6" contenteditable="false">1d6</span>。</p>
</div>

<hr>
<p style="text-align:center"><em>— 冒险结束 —</em></p>
<p style="text-align:center">感谢游玩《幽暗城堡的秘密》</p>`;
}

// =============================================

//  Auto Save
// =============================================
function scheduleAutoSave() {
  if (!state.prefs.autoSave) return;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(async () => {
    const file = state.openFiles[state.activeFileIndex];
    if (!file) return;
    saveCurrentToMemory();
    if (file.unsaved) {
      file.doc.updatedAt = Date.now();
      await saveDocument(file.doc);
      file.unsaved = false;
      renderFileTabs();
      showToast('已自动保存', 'info');
    }
  }, 2000);
}

// =============================================
//  Status Bar
// =============================================
function updateStatusBar() {
  const text = editor.innerText || '';
  const chars = text.replace(/\s/g, '').length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const pageH = 297 * 3.7795275591; // mm to px
  const pages = Math.max(1, Math.ceil(editor.scrollHeight / pageH));
  $('#stat-words').textContent = `\u5B57\u6570: ${chars}`;
  $('#stat-chars').textContent = `\u5B57\u7B26: ${text.length}`;
  $('#stat-pages').textContent = `\u9875\u6570: ${pages}`;
}

// =============================================
//  Format State Tracking
// =============================================
function updateFormatBarState() {
  const format = queryFormatState();
  $$('.format-btn[data-cmd]').forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (format[cmd] !== undefined) {
      btn.classList.toggle('active', format[cmd]);
    }
  });

  // Detect block format
  const block = document.queryCommandValue('formatBlock');
  const select = $('#block-type-select');
  if (select) {
    const tagMap = { h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', p: 'p' };
    let currentVal = tagMap[block ? block.replace(/<|>/g, '').toLowerCase() : ''] || 'p';

    // Check if it has a custom style class
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      let node = sel.anchorNode;
      if (node && node.nodeType === 3) node = node.parentNode;
      const closestBlock = node ? node.closest('h1, h2, h3, h4, p, blockquote, div') : null;
      if (closestBlock && editor.contains(closestBlock)) {
        const match = closestBlock.className.match(/\bcs-\w+\b/);
        if (match) currentVal = match[0];
      }
    }

    if (Array.from(select.options).some(o => o.value === currentVal)) {
      select.value = currentVal;
    } else {
      select.value = 'p';
    }
  }
}

// =============================================
//  Inline Dice Handler
// =============================================
function setupInlineDiceHandler() {
  editor.addEventListener('click', (e) => {
    const diceEl = e.target.closest('.dice-inline');
    if (diceEl) {
      e.preventDefault();
      e.stopPropagation();
      const formula = diceEl.dataset.dice;
      if (!formula) return;
      try {
        const result = rollDice(formula);
        diceEl.textContent = `${formula} = ${result.total}`;
        diceEl.title = `骰点: [${result.rolls.join(', ')}]${result.modifier ? ' + ' + result.modifier : ''}`;
        diceEl.classList.add('rolled');
        setTimeout(() => {
          diceEl.textContent = formula;
          diceEl.classList.remove('rolled');
        }, 3000);
      } catch (err) {
        showToast('骰子公式错误: ' + err.message, 'error');
      }
    }
  });
}

// =============================================
//  Dice Modal
// =============================================
function openDiceModal() {
  $('#dice-modal').classList.remove('hidden');
  $('#dice-formula').focus();
}

function closeDiceModal() {
  $('#dice-modal').classList.add('hidden');
}

function rollDiceFromModal() {
  const formula = $('#dice-formula').value.trim();
  if (!formula) return;
  try {
    const result = rollDice(formula);
    addDiceResult(result);
  } catch (err) {
    showToast('骰子公式错误: ' + err.message, 'error');
  }
}

function addDiceResult(result) {
  const container = $('#dice-results');
  const placeholder = container.querySelector('.dice-placeholder');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = 'dice-result-entry';
  // B7: 使用 result.details 统一显示骰子详情
  entry.innerHTML = `
    <div>
      <div class="dice-result-formula">${result.formula}</div>
      <div class="dice-result-detail">${result.details || ''}</div>
    </div>
    <div class="dice-result-value">${result.total}</div>
  `;
  container.insertBefore(entry, container.firstChild);
}

// =============================================
//  Settings Modal
// =============================================
function openSettingsModal() {
  const modal = $('#settings-modal');
  $('#setting-theme').value = state.prefs.theme || 'light';
  $('#setting-page-style').value = state.prefs.pageStyle || 'parchment';
  $('#setting-heading-style').value = state.prefs.headingStyle || 'classic';
  $('#setting-auto-save').checked = state.prefs.autoSave !== false;

  const margins = state.prefs.margins || { top: 35, bottom: 30, left: 25.4, right: 25.4 };
  $('#setting-margin-top').value = margins.top;
  $('#setting-margin-bottom').value = margins.bottom;
  $('#setting-margin-left').value = margins.left;
  $('#setting-margin-right').value = margins.right;

  modal.classList.remove('hidden');
}

function closeSettingsModal() {
  $('#settings-modal').classList.add('hidden');
}

// =============================================
//  Popovers
// =============================================
function showPopover(popoverId, anchorEl) {
  const popover = document.getElementById(popoverId);
  const rect = anchorEl.getBoundingClientRect();
  popover.style.top = (rect.bottom + 4) + 'px';
  popover.style.left = rect.left + 'px';
  popover.classList.remove('hidden');

  const closeHandler = (e) => {
    if (!popover.contains(e.target) && e.target !== anchorEl) {
      popover.classList.add('hidden');
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
}

function initColorGrid() {
  const colors = [
    '#c0392b', '#e74c3c', '#e67e22', '#f39c12', '#f1c40f', '#27ae60',
    '#2ecc71', '#1abc9c', '#2980b9', '#3498db', '#8e44ad', '#9b59b6',
    '#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', '#ecf0f1', '#ffffff',
    '#58180d', '#7a2a15', '#c9ad6a', '#1a1a2e', '#000000', '#333333',
  ];

  const grid = $('#color-grid');
  grid.innerHTML = '';
  colors.forEach(color => {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.addEventListener('click', () => {
      applyColor(color, state.colorMode);
      $('#color-popover').classList.add('hidden');
      editor.focus();
    });
    grid.appendChild(swatch);
  });
}

// =============================================
//  Toast Notifications
// =============================================
function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
// E3: 暴露 showToast 供导入模块使用
window.__showToast = showToast;

// =============================================
//  Export
// =============================================
function handleExportPDF() {
  saveCurrentToMemory();
  const file = state.openFiles[state.activeFileIndex];
  if (!file) return;

  const printWin = window.open('', '_blank');
  printWin.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${file.doc.title || 'TRPG文档'}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Serif+SC:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
<style>
:root {
  --accent: #0071e3;
  --accent-orange: #f54e00;
  --accent-red: #e60023;
  --text-primary: #1d1d1f;
  --text-secondary: #615d59;
  --text-muted: #a39e98;
  --text-plum: #211922;
  --border: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.15);
  --radius-sm: 8px;
  --radius-md: 12px;
}
body {
  font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria, serif;
  line-height: 1.8;
  font-size: 16px;
  color: var(--text-plum);
  max-width: 210mm;
  margin: 0 auto;
}
h1, h2, h3 { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif; color: var(--text-primary); letter-spacing: -0.02em; }
h1 { font-size: 2.5em; font-weight: 800; border-bottom: 1px solid var(--border-strong); padding-bottom: 4px; margin: 1em 0 0.5em; }
h2 { font-size: 1.8em; font-weight: 700; border-bottom: 1px solid var(--border); padding-bottom: 3px; margin: 1.2em 0 0.6em; }
h3 { font-size: 1.4em; font-weight: 700; border-bottom: 1px solid var(--border); margin: 1.2em 0 0.6em; }
blockquote { border-left: 3px solid var(--accent); padding: 0.5em 1.5em; background: #f6f5f4; font-style: italic; border-radius: 0 4px 4px 0; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; }
th { background: #f6f5f4; color: var(--text-primary); padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 1px solid var(--border-strong); }
td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
.trpg-note { background: #f6f5f4; border: 1px solid var(--border); padding: 16px 20px; margin: 20px 0; border-radius: var(--radius-md); position: relative; }
.trpg-note::before { content: 'NOTE'; display: block; font-weight: 800; color: var(--accent); margin-bottom: 8px; font-size: 11px; letter-spacing: 0.1em; }
.trpg-warning { background: rgba(230, 0, 35, 0.05); border: 1px solid rgba(230, 0, 35, 0.1); padding: 16px 20px; margin: 20px 0; border-radius: var(--radius-md); position: relative; }
.trpg-warning::before { content: 'WARNING'; display: block; font-weight: 800; color: var(--accent-red); margin-bottom: 8px; font-size: 11px; letter-spacing: 0.1em; }
.trpg-stat-block { background: #ffffff; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 24px; margin: 24px 0; position: relative; }
.trpg-stat-block::before, .trpg-stat-block::after { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: var(--accent-orange); }
.trpg-stat-block::before { top: 0; } .trpg-stat-block::after { bottom: 0; }
.trpg-stat-block h3 { color: var(--accent-orange); font-size: 1.4em; font-weight: 800; border: none; margin: 0 0 4px; }
.trpg-stat-block .stat-subtitle { font-style: italic; color: var(--text-secondary); margin-bottom: 8px; font-size: 0.9em; }
.trpg-stat-block table th { background: transparent; color: var(--accent-orange); text-align: center; border-bottom: none; }
.trpg-stat-block table td { text-align: center; border: none; }
.dice-inline { background: var(--accent); color: #fff; padding: 1px 6px; border-radius: 4px; font-size: 0.9em; font-weight: 600; }
.page-break { page-break-after: always; break-after: page; border: none; height: 0; margin: 0; }
hr { border: none; border-top: 1px solid var(--border-strong); margin: 2em 0; }
img { max-width: 100%; border-radius: 4px; }
.page-container { position: relative; width: 210mm; }
.page-bg-card { position: absolute; left: 0; width: 100%; background-size: 100% 100%; background-position: center; background-repeat: no-repeat; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.wysiwyg-editor { position: relative; width: 100%; outline: none; background: transparent; padding: var(--page-pad-top, 35mm) var(--page-pad-right, 25.4mm) var(--page-pad-bottom, 30mm) var(--page-pad-left, 25.4mm); }
@media print {
  body { margin: 0; padding: 0; max-width: none; }
  .page-container { margin: 0; }
  .page-overlay { display: none; }
}
</style>
</head><body><div style="width:210mm; margin:0 auto; position:relative;">${$('#page-underlay').outerHTML}${editor.outerHTML}</div></body></html>`);
  printWin.document.close();
  setTimeout(() => { printWin.print(); }, 500);
}


async function handleExportHTML() {
  saveCurrentToMemory();
  const file = state.openFiles[state.activeFileIndex];
  if (!file) return;
  try {
    const html = await exportToHTML(file.doc);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.doc.title || 'trpg-doc'}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('HTML导出成功', 'success');
  } catch (err) {
    showToast('导出失败: ' + err.message, 'error');
  }
}

function handleExportMarkdown() {
  saveCurrentToMemory();
  const file = state.openFiles[state.activeFileIndex];
  if (!file) return;
  try {
    const md = exportToMarkdown(file.doc);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.doc.title || 'trpg-doc'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Markdown导出成功', 'success');
  } catch (err) {
    showToast('导出失败: ' + err.message, 'error');
  }
}

async function handleExportJSON() {
  saveCurrentToMemory();
  const file = state.openFiles[state.activeFileIndex];
  if (!file) return;
  try {
    const jsonStr = exportToJSON(file.doc);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.doc.title || 'trpg-doc'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON导出成功', 'success');
  } catch (err) {
    showToast('导出失败: ' + err.message, 'error');
  }
}

async function handleExportTXT() {
  saveCurrentToMemory();
  const file = state.openFiles[state.activeFileIndex];
  if (!file) return;
  try {
    const txtStr = exportToTXT(file.doc);
    const blob = new Blob([txtStr], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.doc.title || 'trpg-doc'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('TXT导出成功', 'success');
  } catch (err) {
    showToast('导出失败: ' + err.message, 'error');
  }
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const ext = file.name.split('.').pop().toLowerCase();
  const text = await file.text();
  const title = file.name.replace(/\.[^/.]+$/, "");
  
  try {
    let doc;
    if (ext === 'json') {
      doc = await importFromJSON(text);
      showToast('导入成功', 'success');
    } else if (ext === 'md') {
      const result = await importFromMarkdown(text, title);
      doc = result.doc;
      const s = result.stats;
      showToast(`导入完成: 识别到 ${s.notes}个提示, ${s.blocks}个特色块, ${s.dice}个骰子`, 'success');
      if (s.failures && s.failures.length > 0) {
        showToast(`部分解析失败: ${s.failures.join(', ')}`, 'warning');
      }
    } else if (ext === 'txt') {
      doc = await importFromTXT(text, title);
      showToast('导入成功', 'success');
    } else {
      throw new Error('不支持的文件格式');
    }
    
    state.openFiles.push({ id: doc.id, doc, unsaved: false });
    state.activeFileIndex = state.openFiles.length - 1;
    loadActiveFile();
    renderFileTabs();
  } catch (err) {
    showToast('导入失败: ' + err.message, 'error');
  }
  
  // reset input
  e.target.value = '';
}

// =============================================
//  Event Listeners
// =============================================
function setupEventListeners() {
  initBgImageModal();
  // Editor input — schedule auto save & update layout
  editor.addEventListener('input', () => {
    scheduleAutoSave();
    updatePageLayout();
    updateStatusBar();
  });

  // Window resize — update layout
  window.addEventListener('resize', () => {
    requestAnimationFrame(updatePageLayout);
  });

  // ResizeObserver for robust content changes (images loading, etc)
  const resizeObserver = new ResizeObserver(() => {
    updatePageLayout();
  });
  resizeObserver.observe(editor);

  // Track format state on selection change
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor || editor.contains(document.activeElement)) {
      updateFormatBarState();
    }
  });

  // Inline dice
  setupInlineDiceHandler();

  // Ctrl+S save
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCurrentToMemory();
      const file = state.openFiles[state.activeFileIndex];
      if (file) {
        file.doc.updatedAt = Date.now();
        await saveDocument(file.doc);
        file.unsaved = false;
        renderFileTabs();
        showToast('已保存', 'success');
      }
    }
  });

  // Header buttons
  $('#btn-toggle-sidebar').addEventListener('click', () => {
    formatPanel.classList.toggle('collapsed');
    trpgPanel.classList.toggle('collapsed');
    // V4: update sidebar toggle icon
    const icon = $('#btn-toggle-sidebar').querySelector('.material-symbols-rounded');
    icon.textContent = formatPanel.classList.contains('collapsed') ? 'menu_open' : 'menu';
  });
  $('#btn-new-file').addEventListener('click', () => createNewFile());
  $('#btn-dice').addEventListener('click', openDiceModal);
  
  const exportDropdown = $('#export-dropdown');
  const exportMenu = exportDropdown?.querySelector('.dropdown-menu');
  if (exportDropdown && exportMenu) {
    $('#btn-export-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    });
    
    exportMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const type = btn.dataset.export;
      if (type === 'pdf') handleExportPDF();
      if (type === 'html') handleExportHTML();
      if (type === 'md') handleExportMarkdown();
      if (type === 'json') handleExportJSON();
      if (type === 'txt') handleExportTXT();
      exportMenu.classList.add('hidden');
    });
    
    document.addEventListener('click', (e) => {
      if (!exportDropdown.contains(e.target)) {
        exportMenu.classList.add('hidden');
      }
    });
  }

  const btnImportDoc = $('#btn-import-doc');
  const fileImportDoc = $('#file-import-doc');
  if (btnImportDoc && fileImportDoc) {
    btnImportDoc.addEventListener('click', () => fileImportDoc.click());
    fileImportDoc.addEventListener('change', handleImportFile);
  }
  $('#btn-settings').addEventListener('click', openSettingsModal);

  // About modal integration
  const logoAbout = $('#logo-about');
  if (logoAbout) {
    logoAbout.addEventListener('click', () => {
      $('#about-modal').classList.remove('hidden');
    });
  }
  const btnCloseAbout = $('#btn-close-about');
  if (btnCloseAbout) {
    btnCloseAbout.addEventListener('click', () => {
      $('#about-modal').classList.add('hidden');
    });
  }

  // Sidebar actions (TRPG & Layout elements)
  const handleToolbarClick = (e) => {
    const btn = e.target.closest('.toolbar-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action) {
      if (action === 'image') {
        $('#image-modal').classList.remove('hidden');
      } else if (action === 'bg-image') {
        $('#bg-modal').classList.remove('hidden');
      } else {
        executeToolbarAction(action, editor);
      }
    }
  };
  formatPanel.addEventListener('click', handleToolbarClick);
  trpgPanel.addEventListener('click', handleToolbarClick);

  // Format sidebar — command buttons
  formatPanel.addEventListener('click', (e) => {
    const btn = e.target.closest('.format-btn[data-cmd]');
    if (btn) {
      e.preventDefault();
      executeFormatCommand(btn.dataset.cmd);
      editor.focus();
      updateFormatBarState();
    }
  });

  // Format bar — block type select
  $('#block-type-select').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val.startsWith('cs-')) {
      // Custom style
      const styleId = val.replace('cs-', '');
      const style = (state.prefs.customStyles || []).find(s => s.id === styleId);
      if (style) {
        applyBlockFormat(style.tag);
        setTimeout(() => {
          const sel = window.getSelection();
          if (sel.rangeCount > 0) {
            let node = sel.anchorNode;
            if (node && node.nodeType === 3) node = node.parentNode;
            const block = node ? node.closest('h1, h2, h3, h4, p, blockquote, div') : null;
            if (block && editor.contains(block)) {
              block.className = block.className.replace(/\bcs-\w+\b/g, '').trim();
              block.classList.add(`cs-${style.id}`);
              editor.dispatchEvent(new Event('input'));
            }
          }
        }, 0);
      }
    } else {
      // Standard style
      applyBlockFormat(val);
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          let node = sel.anchorNode;
          if (node && node.nodeType === 3) node = node.parentNode;
          const block = node ? node.closest('h1, h2, h3, h4, p, blockquote, div') : null;
          if (block && editor.contains(block)) {
            block.className = block.className.replace(/\bcs-\w+\b/g, '').trim();
            editor.dispatchEvent(new Event('input'));
          }
        }
      }, 0);
    }
    editor.focus();
  });

  // Font Size Select
  const fontSizeSelect = $('#font-size-select');
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) return;
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('fontSize', false, '7');
      const fontEls = editor.querySelectorAll('font[size="7"]');
      for (let el of fontEls) {
        el.removeAttribute('size');
        el.style.fontSize = val;
      }
      e.target.value = '';
      editor.focus();
      editor.dispatchEvent(new Event('input'));
    });
  }

  // Font select
  $('#btn-font-select').addEventListener('click', (e) => {
    showPopover('font-popover', e.currentTarget);
  });
  $$('.font-option').forEach(btn => {
    btn.addEventListener('click', () => {
      applyFont(btn.dataset.font);
      $('#font-popover').classList.add('hidden');
      editor.focus();
    });
  });

  // Color text
  $('#btn-color-text').addEventListener('click', (e) => {
    state.colorMode = 'text';
    $('#color-popover-title').textContent = '文字颜色';
    showPopover('color-popover', e.currentTarget);
  });

  // Custom color
  $('#custom-color').addEventListener('input', (e) => {
    applyColor(e.target.value, state.colorMode);
    editor.focus();
  });

  // Dice modal
  $('#btn-close-dice').addEventListener('click', closeDiceModal);
  $('#btn-roll-dice').addEventListener('click', rollDiceFromModal);
  $('#dice-formula').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') rollDiceFromModal();
  });
  $$('.dice-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const formula = btn.dataset.dice;
      try {
        const result = rollDice(formula);
        addDiceResult(result);
      } catch (err) {
        showToast('骰子错误: ' + err.message, 'error');
      }
    });
  });

  // Settings modal
  $('#btn-close-settings').addEventListener('click', closeSettingsModal);
  $('#setting-theme').addEventListener('change', (e) => {
    state.prefs.theme = e.target.value;
    applyPreferences(state.prefs);
    persistPreferences();
  });
  $('#setting-page-style').addEventListener('change', (e) => {
    state.prefs.pageStyle = e.target.value;
    updatePageStyle(e.target.value);
    persistPreferences();
  });
  $('#setting-heading-style').addEventListener('change', (e) => {
    state.prefs.headingStyle = e.target.value;
    updateHeadingStyle(e.target.value);
    persistPreferences();
  });
  $('#setting-auto-save').addEventListener('change', (e) => {
    state.prefs.autoSave = e.target.checked;
    persistPreferences();
  });

  const handleMarginChange = () => {
    const top = parseFloat($('#setting-margin-top').value) || 35;
    const bottom = parseFloat($('#setting-margin-bottom').value) || 30;
    const left = parseFloat($('#setting-margin-left').value) || 25.4;
    const right = parseFloat($('#setting-margin-right').value) || 25.4;
    state.prefs.margins = { top, bottom, left, right };
    applyPreferences(state.prefs);
    persistPreferences();
    updatePageLayout();
  };

  $('#setting-margin-top').addEventListener('change', handleMarginChange);
  $('#setting-margin-bottom').addEventListener('change', handleMarginChange);
  $('#setting-margin-left').addEventListener('change', handleMarginChange);
  $('#setting-margin-right').addEventListener('change', handleMarginChange);

  // Close modals on overlay click
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      overlay.closest('.modal').classList.add('hidden');
    });
  });

  // E4: Esc键关闭所有弹出模态框和弹出窗口
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
      $$('.popover:not(.hidden)').forEach(p => p.classList.add('hidden'));
    }
  });

  // Custom Styles Modal Logic
  const btnManageCustomStyles = $('#btn-manage-custom-styles');
  if (btnManageCustomStyles) {
    btnManageCustomStyles.addEventListener('click', () => {
      renderCustomStylesManager();
      $('#custom-styles-modal').classList.remove('hidden');
    });
  }

  const btnCloseCustomStyles = $('#btn-close-custom-styles');
  if (btnCloseCustomStyles) {
    btnCloseCustomStyles.addEventListener('click', () => {
      $('#custom-styles-modal').classList.add('hidden');
    });
  }

  const btnAddCustomStyle = $('#btn-add-custom-style');
  if (btnAddCustomStyle) {
    btnAddCustomStyle.addEventListener('click', () => {
      const name = $('#new-cs-name').value.trim();
      if (!name) return;
      const newStyle = {
        id: Date.now().toString(36),
        name: name,
        tag: $('#new-cs-tag').value,
        color: $('#new-cs-color').value,
        font: $('#new-cs-font').value !== 'inherit' ? $('#new-cs-font').value : '',
        size: $('#new-cs-size').value.trim()
      };
      if (!state.prefs.customStyles) state.prefs.customStyles = [];
      state.prefs.customStyles.push(newStyle);
      persistPreferences();
      updateCustomStylesCSS(state.prefs.customStyles);
      renderCustomStylesManager();

      $('#new-cs-name').value = '';
      $('#new-cs-size').value = '';
    });
  }

  function renderCustomStylesManager() {
    const list = $('#custom-styles-list');
    if (!list) return;
    list.innerHTML = '';
    const styles = state.prefs.customStyles || [];
    if (styles.length === 0) {
      list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:10px;">暂无自定义样式</div>';
      return;
    }
    styles.forEach(s => {
      const row = document.createElement('div');
      row.style = `display:flex; justify-content:space-between; align-items:center; padding: 6px; border-bottom:1px solid var(--border-light);`;
      row.innerHTML = `
          <div style="flex:1; display:flex; align-items:center; gap:8px;">
            <span style="font-weight:bold">${s.name}</span>
            <span style="font-size:11px; color:var(--text-muted); background:var(--bg-tertiary); padding:2px 4px; border-radius:3px;">${s.tag}</span>
            ${s.color ? `<span style="width:12px;height:12px;background:${s.color};border-radius:50%;display:inline-block;" title="颜色"></span>` : ''}
            ${s.font ? `<span style="font-family:${s.font.replace(/'/g, '')};font-size:12px;">字体</span>` : ''}
            ${s.size ? `<span style="font-size:11px;">[${s.size}]</span>` : ''}
          </div>
          <button class="icon-btn btn-del-cs" data-id="${s.id}" style="width:24px;height:24px;"><span class="material-symbols-rounded" style="font-size:16px;color:var(--accent);">delete</span></button>
        `;
      list.appendChild(row);
    });
    $$('.btn-del-cs').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        state.prefs.customStyles = state.prefs.customStyles.filter(s => s.id !== id);
        persistPreferences();
        updateCustomStylesCSS(state.prefs.customStyles);
        renderCustomStylesManager();
      });
    });
  }

  // Image modal logic
  $('#btn-close-image').addEventListener('click', () => {
    $('#image-modal').classList.add('hidden');
  });

  $('#btn-image-local').addEventListener('click', () => {
    $('#input-image-local').click();
  });

  $('#input-image-local').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        editor.focus();
        document.execCommand('insertHTML', false, `<img src="${event.target.result}" alt="图片" style="max-width:100%"><br>`);
        updatePageLayout();
        $('#image-modal').classList.add('hidden');
        $('#input-image-local').value = '';
      };
      reader.readAsDataURL(file);
    }
  });

  $('#btn-image-url').addEventListener('click', () => {
    const url = $('#input-image-url').value.trim();
    if (url) {
      editor.focus();
      document.execCommand('insertHTML', false, `<img src="${url.replace(/"/g, '&quot;')}" alt="图片" style="max-width:100%"><br>`);
      updatePageLayout();
      $('#image-modal').classList.add('hidden');
      $('#input-image-url').value = '';
    }
  });

  // B6: 粘贴时清除外部富文本样式，仅粘贴纯文本
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  // Floating Delete Button Logic
  initFloatingDeleteBtn();
}

function initBgImageModal() {
  const bgScopeSelect = $('#bg-scope');
  if (bgScopeSelect) {
    bgScopeSelect.addEventListener('change', (e) => {
      $('#bg-custom-pages').style.display = e.target.value === 'custom' ? 'block' : 'none';
    });
  }

  $('#btn-close-bg').addEventListener('click', () => {
    $('#bg-modal').classList.add('hidden');
  });

  const applyBgToScope = (url) => {
    const file = state.openFiles[state.activeFileIndex];
    if (!file) return;
    if (!file.doc.backgrounds) file.doc.backgrounds = {};

    const scope = $('#bg-scope').value;
    const mmToPx = 3.779527559;
    const pageHeight = Math.ceil(297 * mmToPx);
    const editorScrollEl = $('#editor-scroll');
    const currentPage = Math.max(1, Math.ceil((editorScrollEl.scrollTop + editorScrollEl.clientHeight / 2) / pageHeight));

    if (url === null) {
      if (scope === 'all') file.doc.backgrounds = {};
      else if (scope === 'single') delete file.doc.backgrounds[currentPage.toString()];
      else if (scope === 'custom') {
        const parts = $('#bg-custom-pages').value.split(',');
        parts.forEach(p => {
          p = p.trim();
          if (p.includes('-')) {
            const [s, e] = p.split('-').map(Number);
            if (s && e && s <= e) for (let i = s; i <= e; i++) delete file.doc.backgrounds[i.toString()];
          } else {
            const n = Number(p);
            if (n) delete file.doc.backgrounds[n.toString()];
          }
        });
      }
    } else {
      if (scope === 'all') file.doc.backgrounds['all'] = url;
      else if (scope === 'single') file.doc.backgrounds[currentPage.toString()] = url;
      else if (scope === 'custom') {
        const parts = $('#bg-custom-pages').value.split(',');
        parts.forEach(p => {
          p = p.trim();
          if (p.includes('-')) {
            const [s, e] = p.split('-').map(Number);
            if (s && e && s <= e) for (let i = s; i <= e; i++) file.doc.backgrounds[i.toString()] = url;
          } else {
            const n = Number(p);
            if (n) file.doc.backgrounds[n.toString()] = url;
          }
        });
      }
    }

    file.unsaved = true;
    renderFileTabs();
    updatePageLayout();
    $('#bg-modal').classList.add('hidden');
    scheduleAutoSave();
  };

  $('#btn-bg-local').addEventListener('click', () => {
    $('#input-bg-local').click();
  });

  $('#input-bg-local').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        applyBgToScope(event.target.result);
        $('#input-bg-local').value = '';
      };
      reader.readAsDataURL(file);
    }
  });

  $('#btn-bg-url').addEventListener('click', () => {
    const url = $('#input-bg-url').value.trim();
    if (url) {
      applyBgToScope(url);
      $('#input-bg-url').value = '';
    }
  });

  $('#btn-bg-clear').addEventListener('click', () => applyBgToScope(null));
}

function initFloatingDeleteBtn() {
  const moduleDelBtn = document.createElement('button');
  moduleDelBtn.className = 'icon-btn';
  moduleDelBtn.innerHTML = '<span class="material-symbols-rounded">delete</span>';
  Object.assign(moduleDelBtn.style, {
    position: 'absolute',
    display: 'none',
    background: 'var(--accent)',
    color: '#fff',
    zIndex: '150',
    borderRadius: '50%',
    width: '28px',
    height: '28px'
  });
  moduleDelBtn.title = '删除此模块';
  moduleDelBtn.contentEditable = 'false';

  const container = $('#page-container');
  if (container) {
    container.appendChild(moduleDelBtn);
  }

  let currentHoverModule = null;

  if (container) {
    container.addEventListener('mousemove', (e) => {
      const mod = e.target.closest('.trpg-generic-block, .trpg-note, .trpg-warning, .trpg-stat-block, .trpg-coc-stat-block, .trpg-spell-card, .trpg-coc-spell-card, .trpg-item-card, .dice-inline, .trpg-dh-enemy, .trpg-dh-scene');
      if (mod && editor.contains(mod)) {
        if (currentHoverModule !== mod) {
          currentHoverModule = mod;
          updateDeleteBtnPos();
        }
      } else {
        if (e.target.closest && e.target.closest('.icon-btn') === moduleDelBtn) return;
        moduleDelBtn.style.display = 'none';
        currentHoverModule = null;
      }
    });
  }

  function updateDeleteBtnPos() {
    if (!currentHoverModule) return;
    const mod = currentHoverModule;
    const modRect = mod.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    moduleDelBtn.style.display = 'flex';
    moduleDelBtn.style.top = (modRect.top - containerRect.top - 10) + 'px';
    moduleDelBtn.style.left = (modRect.right - containerRect.left - 20) + 'px';
  }

  if (container) {
    container.addEventListener('mouseleave', () => {
      moduleDelBtn.style.display = 'none';
      currentHoverModule = null;
    });
  }

  moduleDelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentHoverModule) {
      if (confirm('确定要整块删除这个模块吗？')) {
        currentHoverModule.remove();
        moduleDelBtn.style.display = 'none';
        editor.dispatchEvent(new Event('input'));
      }
    }
  });
}

// =============================================
//  Page Layout (A4 Pagination)
// =============================================
let _isLayoutUpdating = false;

function updatePageLayout() {
  if (_isLayoutUpdating) return;
  _isLayoutUpdating = true;

  // Save selection before potential layout reflows (height changes)
  const selection = window.getSelection();
  let savedRange = null;
  if (selection.rangeCount > 0 && (editor.contains(selection.anchorNode) || editor === selection.anchorNode)) {
    savedRange = selection.getRangeAt(0).cloneRange();
  }

  try {
    const container = $('#page-container');
    const overlay = $('#page-overlay');

    if (!container || !overlay) return;

    // 1mm = 3.7795px approx
    const mmToPx = 3.779527559;
    const pageHeight = Math.ceil(297 * mmToPx); // ~1123px standard A4 height at 96dpi

    // We need to reset height to auto temporarily to measure natural content height
    editor.style.height = 'auto'; // Reset to measure
    const contentHeight = editor.scrollHeight;
    const numPages = Math.max(1, Math.ceil(contentHeight / pageHeight));

    // Set height to multiple of page height
    editor.style.height = `${numPages * pageHeight}px`;

    const file = state.openFiles[state.activeFileIndex];
    const bgData = (file && file.doc.backgrounds) || {};
    const bgDataStr = JSON.stringify(bgData);
    const fileId = file ? file.id : null;

    // Memoization: Do not re-create DOM elements if nothing has changed
    if (updatePageLayout.lastRun
      && updatePageLayout.lastRun.fileId === fileId
      && updatePageLayout.lastRun.numPages === numPages
      && updatePageLayout.lastRun.bgDataStr === bgDataStr) {
      return;
    }

    updatePageLayout.lastRun = { fileId, numPages, bgDataStr };

    overlay.innerHTML = '';
    const underlay = $('#page-underlay');
    if (underlay) underlay.innerHTML = '';

    for (let i = 1; i <= numPages; i++) {
      // Underlay bg card for individual page
      if (underlay) {
        const bgCard = document.createElement('div');
        bgCard.className = 'page-bg-card';
        bgCard.style.top = `${(i - 1) * pageHeight}px`;
        bgCard.style.height = `${pageHeight}px`;

        let bgImg = bgData[i.toString()] || bgData['all'];
        if (bgImg) {
          bgCard.style.backgroundImage = `url(${bgImg})`;
        }
        underlay.appendChild(bgCard);
      }

      // Page Number
      const pageNum = document.createElement('div');
      pageNum.className = 'page-number';
      pageNum.textContent = `- ${i} -`;
      pageNum.style.top = `${i * pageHeight - 30}px`; // 30px from bottom
      overlay.appendChild(pageNum);

      // Divider (between pages)
      if (i < numPages) {
        const divider = document.createElement('div');
        divider.className = 'page-divider';
        divider.dataset.page = `第 ${i + 1} 页`;
        divider.style.top = `${i * pageHeight}px`;
        overlay.appendChild(divider);
      }
    }
  } finally {
    // Restore selection after layout reflow
    if (savedRange) {
      try {
        selection.removeAllRanges();
        selection.addRange(savedRange);
      } catch (e) {}
    }
    _isLayoutUpdating = false;
  }
}
