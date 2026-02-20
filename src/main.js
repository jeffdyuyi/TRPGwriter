/**
 * TRPG写作工坊 — Main Application Entry Point
 * Orchestrates all modules: editor, preview, toolbar, dice, storage, settings
 */

import './style.css';
import { renderMarkdown, getWordCount } from './parser.js';
import { evaluateDiceExpression } from './dice.js';
import { executeAction, setupShortcuts } from './toolbar.js';
import {
  createDocument,
  saveDocument,
  loadDocument,
  getAllDocuments,
  deleteDocument,
  savePreferences,
  loadPreferences,
  exportAsHTML
} from './storage.js';

// =============================================
//  State
// =============================================
let state = {
  prefs: loadPreferences(),
  openFiles: [], // Array of { id, doc, unsaved }
  activeFileIndex: -1,
  autoSaveTimer: null,
  isResizing: false
};

// =============================================
//  DOM References
// =============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const editor = $('#editor');
const previewContent = $('#preview-content');
const previewContainer = $('#preview-container');
const fileTabs = $('#file-tabs');
const toolbarPanel = $('#toolbar-panel');
const zoomLevelEl = $('#zoom-level');

// =============================================
//  Initialization
// =============================================
async function init() {
  // Apply saved preferences
  applyPreferences(state.prefs);

  // Load existing documents or create a new one
  const docs = await getAllDocuments();

  if (docs.length > 0) {
    // Restore previously open files
    const lastOpen = state.prefs.lastOpenFiles || [];
    if (lastOpen.length > 0) {
      for (const id of lastOpen) {
        const doc = await loadDocument(id);
        if (doc) {
          state.openFiles.push({ id: doc.id, doc, unsaved: false });
        }
      }
    }

    // If none were restored, open the most recent
    if (state.openFiles.length === 0) {
      state.openFiles.push({ id: docs[0].id, doc: docs[0], unsaved: false });
    }

    // Set active file
    const activeId = state.prefs.activeFileId;
    const activeIdx = state.openFiles.findIndex(f => f.id === activeId);
    state.activeFileIndex = activeIdx >= 0 ? activeIdx : 0;
  } else {
    // Create a new document
    const doc = createDocument();
    await saveDocument(doc);
    state.openFiles.push({ id: doc.id, doc, unsaved: false });
    state.activeFileIndex = 0;
  }

  // Render initial state
  renderFileTabs();
  loadActiveFile();

  // Set up event listeners
  setupEventListeners();
  setupShortcuts(editor);
  setupResizeHandle();
  setupInlineDiceHandler();

  // Restore editor width if saved
  if (state.prefs.editorWidth) {
    const editorArea = $('#editor-area');
    editorArea.style.flex = `0 0 ${state.prefs.editorWidth}px`;
  }

  // Sidebar state
  if (state.prefs.sidebarExpanded) {
    toolbarPanel.classList.add('expanded');
  }

  // Initial preview render
  updatePreview();
}

// =============================================
//  Preferences
// =============================================
function applyPreferences(prefs) {
  // Theme
  document.documentElement.setAttribute('data-theme', prefs.theme);

  // Editor font size
  document.documentElement.style.setProperty('--editor-font-size', `${prefs.editorFontSize}px`);

  // Page style
  updatePageStyle(prefs.pageStyle);

  // Settings controls
  const themeSelect = $('#setting-theme');
  const fontSizeRange = $('#setting-font-size');
  const fontSizeValue = $('#setting-font-size-value');
  const pageStyleSelect = $('#setting-page-style');
  const autoSaveToggle = $('#setting-auto-save');

  if (themeSelect) themeSelect.value = prefs.theme;
  if (fontSizeRange) {
    fontSizeRange.value = prefs.editorFontSize;
    fontSizeValue.textContent = `${prefs.editorFontSize}px`;
  }
  if (pageStyleSelect) pageStyleSelect.value = prefs.pageStyle;
  if (autoSaveToggle) autoSaveToggle.checked = prefs.autoSave;
}

function updatePageStyle(style) {
  previewContent.className = 'preview-content';
  switch (style) {
    case 'modern':
      previewContent.classList.add('style-modern');
      break;
    case 'dark-fantasy':
      previewContent.classList.add('style-dark-fantasy');
      break;
    default: // parchment
      break;
  }
}

function persistPreferences() {
  state.prefs.lastOpenFiles = state.openFiles.map(f => f.id);
  state.prefs.activeFileId = state.openFiles[state.activeFileIndex]?.id || null;
  savePreferences(state.prefs);
}

// =============================================
//  File Tabs
// =============================================
function renderFileTabs() {
  fileTabs.innerHTML = '';
  state.openFiles.forEach((file, index) => {
    const tab = document.createElement('div');
    tab.className = `file-tab${index === state.activeFileIndex ? ' active' : ''}`;
    tab.innerHTML = `
      ${file.unsaved ? '<span class="tab-unsaved"></span>' : ''}
      <span class="tab-name">${escapeHTML(file.doc.title)}</span>
      <button class="tab-close" data-index="${index}" title="关闭">&times;</button>
    `;
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return;
      switchToFile(index);
    });
    fileTabs.appendChild(tab);
  });

  // Close buttons
  fileTabs.querySelectorAll('.tab-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFile(parseInt(btn.dataset.index));
    });
  });
}

function switchToFile(index) {
  if (index === state.activeFileIndex) return;

  // Save current content to memory
  saveCurrentToMemory();

  state.activeFileIndex = index;
  loadActiveFile();
  renderFileTabs();
  persistPreferences();
}

function loadActiveFile() {
  const file = state.openFiles[state.activeFileIndex];
  if (!file) return;
  editor.value = file.doc.content;
  updatePreview();
}

function saveCurrentToMemory() {
  const file = state.openFiles[state.activeFileIndex];
  if (!file) return;
  const currentContent = editor.value;
  if (currentContent !== file.doc.content) {
    file.doc.content = currentContent;
    file.unsaved = true;
  }
}

async function closeFile(index) {
  const file = state.openFiles[index];

  if (file.unsaved) {
    if (!confirm(`"${file.doc.title}" 尚未保存，确定要关闭吗？`)) {
      return;
    }
  }

  state.openFiles.splice(index, 1);

  if (state.openFiles.length === 0) {
    // Create new file if all closed
    const doc = createDocument();
    await saveDocument(doc);
    state.openFiles.push({ id: doc.id, doc, unsaved: false });
    state.activeFileIndex = 0;
  } else if (state.activeFileIndex >= state.openFiles.length) {
    state.activeFileIndex = state.openFiles.length - 1;
  } else if (index < state.activeFileIndex) {
    state.activeFileIndex--;
  } else if (index === state.activeFileIndex) {
    state.activeFileIndex = Math.min(state.activeFileIndex, state.openFiles.length - 1);
  }

  loadActiveFile();
  renderFileTabs();
  persistPreferences();
}

async function createNewFile() {
  saveCurrentToMemory();

  const title = prompt('请输入文件名称：', '未命名文档') || '未命名文档';
  const doc = createDocument(title);
  await saveDocument(doc);

  state.openFiles.push({ id: doc.id, doc, unsaved: false });
  state.activeFileIndex = state.openFiles.length - 1;

  loadActiveFile();
  renderFileTabs();
  persistPreferences();
  showToast(`已创建 "${title}"`, 'success');
}

// =============================================
//  Preview
// =============================================
let previewDebounceTimer = null;

function updatePreview() {
  const markdown = editor.value;
  const html = renderMarkdown(markdown);
  previewContent.innerHTML = html;
}

function debouncedUpdatePreview() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(updatePreview, 150);
}

// =============================================
//  Auto Save
// =============================================
function scheduleAutoSave() {
  if (!state.prefs.autoSave) return;

  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(async () => {
    const file = state.openFiles[state.activeFileIndex];
    if (file && file.unsaved) {
      file.doc.content = editor.value;
      await saveDocument(file.doc);
      file.unsaved = false;
      renderFileTabs();
    }
  }, 2000);
}

// =============================================
//  Zoom
// =============================================
let zoomLevel = 100;

function setZoom(level) {
  zoomLevel = Math.max(50, Math.min(200, level));
  previewContent.style.transform = `scale(${zoomLevel / 100})`;
  previewContent.style.transformOrigin = 'top center';
  zoomLevelEl.textContent = `${zoomLevel}%`;
}

// =============================================
//  Resize Handle
// =============================================
function setupResizeHandle() {
  const handle = $('#resize-handle');
  const editorArea = $('#editor-area');

  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    state.isResizing = true;
    startX = e.clientX;
    startWidth = editorArea.offsetWidth;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const newWidth = Math.max(300, Math.min(window.innerWidth - 400, startWidth + dx));
      editorArea.style.flex = `0 0 ${newWidth}px`;
    };

    const onMouseUp = () => {
      state.isResizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Save width preference
      state.prefs.editorWidth = editorArea.offsetWidth;
      persistPreferences();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// =============================================
//  Inline Dice (from preview)
// =============================================
function setupInlineDiceHandler() {
  window.__rollInlineDice = function (el) {
    const formula = el.dataset.formula;
    try {
      const result = evaluateDiceExpression(formula);
      const resultSpan = el.querySelector('.dice-result');
      resultSpan.textContent = ` = ${result.total}`;
      el.classList.add('rolled');
      el.title = `${result.formula}: ${result.details} = ${result.total}`;

      setTimeout(() => el.classList.remove('rolled'), 500);
    } catch (err) {
      showToast(`骰子错误: ${err.message}`, 'error');
    }
  };
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
  const input = $('#dice-formula');
  const formula = input.value.trim();
  if (!formula) return;

  try {
    const result = evaluateDiceExpression(formula);
    addDiceResult(result);
  } catch (err) {
    showToast(`骰子错误: ${err.message}`, 'error');
  }
}

function addDiceResult(result) {
  const container = $('#dice-results');

  // Remove placeholder
  const placeholder = container.querySelector('.dice-placeholder');
  if (placeholder) placeholder.remove();

  const item = document.createElement('div');
  item.className = 'dice-result-item';
  item.innerHTML = `
    <div>
      <div class="dice-result-formula">${result.formula}</div>
      <div class="dice-result-details">${result.details}</div>
    </div>
    <div class="dice-result-total">${result.total}</div>
  `;

  container.insertBefore(item, container.firstChild);

  // Limit history
  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

// =============================================
//  Settings Modal
// =============================================
function openSettingsModal() {
  $('#settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  $('#settings-modal').classList.add('hidden');
}

// =============================================
//  Popovers
// =============================================
function showPopover(popoverId, anchorEl) {
  const popover = $(`#${popoverId}`);
  const rect = anchorEl.getBoundingClientRect();

  popover.style.left = `${rect.right + 8}px`;
  popover.style.top = `${rect.top}px`;
  popover.classList.remove('hidden');

  // Close on outside click
  const closeHandler = (e) => {
    if (!popover.contains(e.target) && !anchorEl.contains(e.target)) {
      popover.classList.add('hidden');
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

function initColorGrid() {
  const grid = $('#color-grid');
  const colors = [
    '#2c3e50', '#34495e', '#7f8c8d', '#95a5a6',
    '#e74c3c', '#c0392b', '#e67e22', '#d35400',
    '#f1c40f', '#f39c12', '#2ecc71', '#27ae60',
    '#1abc9c', '#16a085', '#3498db', '#2980b9',
    '#9b59b6', '#8e44ad', '#ecf0f1', '#bdc3c7',
    '#58180d', '#702020', '#8b6914', '#c9ad6a',
  ];

  grid.innerHTML = colors.map(c =>
    `<button class="color-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`
  ).join('');
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
    toast.style.animation = 'toastExit 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// =============================================
//  Export
// =============================================
function handleExportPDF() {
  saveCurrentToMemory();
  updatePreview();

  // Open a new window with just the preview for printing
  const printWindow = window.open('', '_blank');
  const file = state.openFiles[state.activeFileIndex];

  printWindow.document.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${file.doc.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700;900&family=Noto+Sans+SC:wght@300;400;500;600;700&family=ZCOOL+XiaoWei&display=swap" rel="stylesheet">
  <style>
    :root {
      --font-serif: 'Noto Serif SC', 'Georgia', serif;
      --font-sans: 'Noto Sans SC', 'Segoe UI', sans-serif;
      --font-display: 'ZCOOL XiaoWei', 'Noto Serif SC', serif;
      --font-mono: 'Cascadia Code', 'Consolas', monospace;
      --radius-sm: 4px;
      --radius-md: 8px;
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
    h1 { font-family: var(--font-display); font-size: 32px; color: #58180d; border-bottom: 4px solid #c9ad6a; padding-bottom: 6px; letter-spacing: 1px; margin: 24px 0 12px; }
    h2 { font-family: var(--font-display); font-size: 24px; color: #58180d; border-bottom: 2px solid #c9ad6a; padding-bottom: 4px; margin: 20px 0 8px; }
    h3 { font-size: 19px; color: #58180d; border-bottom: 1px solid rgba(201,173,106,0.4); padding-bottom: 3px; margin: 16px 0 6px; }
    h4 { font-size: 16px; color: #58180d; font-style: italic; margin: 14px 0 4px; }
    h5 { font-size: 14px; color: #702020; margin: 12px 0 4px; }
    p { margin: 8px 0; text-align: justify; }
    strong { color: #3e1f0a; }
    em { color: #5a341e; }
    a { color: #4b72a8; text-decoration: none; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px; }
    thead tr { background: #58180d; color: #fdf6e3; }
    th { padding: 8px 12px; font-weight: 600; text-align: left; }
    td { padding: 7px 12px; border-bottom: 1px solid rgba(201,173,106,0.3); }
    tbody tr:nth-child(even) { background: rgba(201,173,106,0.06); }
    blockquote { padding: 12px 20px; border-left: 4px solid #c9ad6a; background: rgba(201,173,106,0.08); font-style: italic; margin: 12px 0; border-radius: 0 4px 4px 0; }
    hr { border: none; height: 2px; background: linear-gradient(to right, transparent, #c9ad6a, transparent); margin: 20px 0; }
    code { font-family: var(--font-mono); font-size: 0.9em; background: rgba(88,24,13,0.06); padding: 2px 6px; border-radius: 3px; color: #702020; }
    pre { background: #2c2416; color: #fdf6e3; padding: 16px 20px; border-radius: 8px; overflow-x: auto; margin: 12px 0; font-size: 13px; }
    pre code { background: none; color: inherit; }
    mark { background: rgba(255,225,0,0.3); padding: 1px 4px; border-radius: 2px; }
    .trpg-note { background: linear-gradient(135deg, #f0e4c8, #e8dbb8); border: 2px solid #c9ad6a; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .trpg-warning { background: linear-gradient(135deg, #4a1a1a, #3a1515); border: 2px solid #8b2500; border-radius: 8px; padding: 16px 20px; margin: 16px 0; color: #f0d0c0; }
    .trpg-warning h5 { color: #ff6b35; }
    .trpg-stat-block { background: linear-gradient(to bottom, #fdf6e3, #f4e8cc); border-top: 3px solid #c9ad6a; border-bottom: 3px solid #c9ad6a; padding: 16px 20px; margin: 20px 0; font-size: 14px; }
    .trpg-stat-block h3 { font-family: var(--font-display); font-size: 22px; border: none; padding: 0; margin: 0 0 2px; }
    .trpg-spell { background: linear-gradient(135deg, #e8e0f0, #ddd6ea); border: 2px solid #7b68a8; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .trpg-spell h5 { color: #4a3570; }
    .trpg-item { background: linear-gradient(135deg, #e0eef0, #d0e4e8); border: 2px solid #4a8b9a; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .trpg-item h5 { color: #2a5a68; }
    .dice-roll { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; background: linear-gradient(135deg, #58180d, #702020); color: #fdf6e3; border-radius: 20px; font-weight: 600; font-size: 13px; font-family: var(--font-sans); }
    .preview-page-break { page-break-before: always; margin: 0; height: 0; }
    ul, ol { padding-left: 28px; margin: 8px 0; }
    li { margin: 4px 0; }
    @media print {
      body { padding: 20mm 25mm; }
      .preview-page-break { page-break-before: always; height: 0; background: transparent; }
    }
  </style>
</head>
<body>
${previewContent.innerHTML}
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 500);
  };
<\/script>
</body>
</html>`);
  printWindow.document.close();
  showToast('正在准备打印...', 'info');
}

function handleExportHTML() {
  saveCurrentToMemory();
  updatePreview();

  const file = state.openFiles[state.activeFileIndex];
  exportAsHTML(file.doc, previewContent.innerHTML);
  showToast(`已导出 "${file.doc.title}.html"`, 'success');
}

// =============================================
//  Event Listeners
// =============================================
function setupEventListeners() {
  // Editor input
  editor.addEventListener('input', () => {
    const file = state.openFiles[state.activeFileIndex];
    if (file) {
      file.unsaved = true;
      renderFileTabs();
    }
    debouncedUpdatePreview();
    scheduleAutoSave();
  });

  // Toolbar buttons
  toolbarPanel.addEventListener('click', (e) => {
    const btn = e.target.closest('.toolbar-btn');
    if (!btn) return;

    const action = btn.dataset.action;

    // Special actions that open popovers
    if (action === 'font-select') {
      showPopover('font-popover', btn);
      return;
    }
    if (action === 'color-text') {
      $('#color-popover-title').textContent = '文字颜色';
      $('#color-popover').dataset.mode = 'text';
      showPopover('color-popover', btn);
      return;
    }
    if (action === 'color-bg') {
      $('#color-popover-title').textContent = '背景颜色';
      $('#color-popover').dataset.mode = 'bg';
      showPopover('color-popover', btn);
      return;
    }

    executeAction(action, editor);
  });

  // Sidebar toggle
  $('#btn-toggle-sidebar').addEventListener('click', () => {
    toolbarPanel.classList.toggle('expanded');
    state.prefs.sidebarExpanded = toolbarPanel.classList.contains('expanded');
    persistPreferences();
  });

  // New file
  $('#btn-new-file').addEventListener('click', createNewFile);

  // Dice modal
  $('#btn-dice').addEventListener('click', openDiceModal);
  $('#btn-close-dice').addEventListener('click', closeDiceModal);
  $('#dice-modal .modal-overlay').addEventListener('click', closeDiceModal);
  $('#btn-roll-dice').addEventListener('click', rollDiceFromModal);
  $('#dice-formula').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') rollDiceFromModal();
  });

  // Quick dice buttons
  $$('.dice-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const formula = btn.dataset.dice;
      $('#dice-formula').value = formula;
      try {
        const result = evaluateDiceExpression(formula);
        addDiceResult(result);
      } catch (err) {
        showToast(`骰子错误: ${err.message}`, 'error');
      }
    });
  });

  // Export buttons
  $('#btn-export-pdf').addEventListener('click', handleExportPDF);
  $('#btn-export-html').addEventListener('click', handleExportHTML);

  // Settings
  $('#btn-settings').addEventListener('click', openSettingsModal);
  $('#btn-close-settings').addEventListener('click', closeSettingsModal);
  $('#settings-modal .modal-overlay').addEventListener('click', closeSettingsModal);

  // Settings controls
  $('#setting-theme').addEventListener('change', (e) => {
    state.prefs.theme = e.target.value;
    applyPreferences(state.prefs);
    persistPreferences();
  });

  $('#setting-font-size').addEventListener('input', (e) => {
    const size = parseInt(e.target.value);
    state.prefs.editorFontSize = size;
    $('#setting-font-size-value').textContent = `${size}px`;
    applyPreferences(state.prefs);
    persistPreferences();
  });

  $('#setting-page-style').addEventListener('change', (e) => {
    state.prefs.pageStyle = e.target.value;
    updatePageStyle(e.target.value);
    persistPreferences();
  });

  $('#setting-auto-save').addEventListener('change', (e) => {
    state.prefs.autoSave = e.target.checked;
    persistPreferences();
  });

  // Zoom
  $('#btn-zoom-in').addEventListener('click', () => setZoom(zoomLevel + 10));
  $('#btn-zoom-out').addEventListener('click', () => setZoom(zoomLevel - 10));

  // Font popover
  $$('.font-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const font = btn.dataset.font;
      const selected = editor.value.substring(editor.selectionStart, editor.selectionEnd);
      if (selected) {
        // Wrap with HTML span
        const wrapped = `<span style="font-family:'${font}'">${selected}</span>`;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + wrapped + editor.value.substring(end);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        showToast('请先选中文本再应用字体', 'info');
      }
      $('#font-popover').classList.add('hidden');
    });
  });

  // Color popover
  initColorGrid();

  $('#color-grid').addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    applyColor(swatch.dataset.color);
    $('#color-popover').classList.add('hidden');
  });

  $('#custom-color').addEventListener('change', (e) => {
    applyColor(e.target.value);
    $('#color-popover').classList.add('hidden');
  });

  // Ctrl+S save
  document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      const file = state.openFiles[state.activeFileIndex];
      if (file) {
        file.doc.content = editor.value;
        await saveDocument(file.doc);
        file.unsaved = false;
        renderFileTabs();
        showToast('已保存', 'success');
      }
    }
  });

  // Before unload — save
  window.addEventListener('beforeunload', () => {
    saveCurrentToMemory();
    const file = state.openFiles[state.activeFileIndex];
    if (file) {
      file.doc.content = editor.value;
      // Synchronous save via localStorage fallback
      const docs = JSON.parse(localStorage.getItem('trpg-docs') || '{}');
      file.doc.updatedAt = Date.now();
      docs[file.doc.id] = file.doc;
      localStorage.setItem('trpg-docs', JSON.stringify(docs));
    }
    persistPreferences();
  });
}

function applyColor(color) {
  const mode = $('#color-popover').dataset.mode;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.substring(start, end);

  if (!selected) {
    showToast('请先选中文本再应用颜色', 'info');
    return;
  }

  // Wrap with HTML span
  const prop = mode === 'bg' ? 'background' : 'color';
  const wrapped = `<span style="${prop}:${color}">${selected}</span>`;
  editor.value = editor.value.substring(0, start) + wrapped + editor.value.substring(end);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

// =============================================
//  Utility
// =============================================
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =============================================
//  Boot
// =============================================
init().catch(err => {
  console.error('Failed to initialize:', err);
  showToast('初始化失败，请刷新页面', 'error');
});
