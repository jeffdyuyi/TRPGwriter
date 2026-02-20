
/**
 * Importer UI
 * Handles interactions for the Import Modal
 */

export function initImporterUI(importer) {
    const modal = document.getElementById('import-modal');
    const btnOpen = document.getElementById('btn-import');
    const btnClose = document.getElementById('btn-close-import');
    const btnConfirm = document.getElementById('btn-import-confirm');

    // Inputs
    const selectSource = document.getElementById('import-source');
    const typeButtons = document.querySelectorAll('.type-btn');
    const inputSearch = document.getElementById('import-search');
    const listResults = document.getElementById('import-results');
    const previewPane = document.getElementById('import-preview');
    const statusSpan = document.getElementById('import-status');

    // State
    let currentState = {
        source: 'kiwee-5e', // Default
        type: 'spell',      // Default
        selectedItem: null,
        previewHtml: ''
    };

    // Debounce helper
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // --- Actions ---

    function openModal() {
        modal.classList.remove('hidden');
        inputSearch.focus();
        // Load initial list if empty? Or just wait for search?
        // Maybe trigger empty search to show some results if allowed?
        // For now wait for input.
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    async function doSearch() {
        const query = inputSearch.value.trim();
        if (!query) {
            listResults.innerHTML = '<div class="empty-state">请输入关键词搜索</div>';
            return;
        }

        listResults.innerHTML = '<div class="empty-state">搜索中...</div>';

        try {
            const results = await importer.search(currentState.source, currentState.type, query);
            renderResults(results);
        } catch (e) {
            console.error(e);
            listResults.innerHTML = `<div class="empty-state error">搜索失败: ${e.message}</div>`;
        }
    }

    function renderResults(results) {
        if (!results || results.length === 0) {
            listResults.innerHTML = '<div class="empty-state">未找到匹配项</div>';
            return;
        }

        listResults.innerHTML = '';
        results.forEach(item => {
            const el = document.createElement('div');
            el.className = 'import-list-item';
            // Determine display name
            const name = item.cn || item.n;
            const sub = item.n && item.cn ? item.n : '';

            el.innerHTML = `
                <span class="item-name">${name}</span>
                ${sub ? `<span class="item-source">${sub}</span>` : ''}
                <div class="item-source" style="margin-top:2px; font-size:0.75em; color:#bbb">${parseSource(item.u)}</div>
            `;

            el.addEventListener('click', () => selectItem(item, el));
            listResults.appendChild(el);
        });
    }

    function parseSource(u) {
        if (!u) return '';
        const parts = u.split('_');
        return parts[parts.length - 1].toUpperCase();
    }

    async function selectItem(item, el) {
        // Highlight logic
        document.querySelectorAll('.import-list-item').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');

        currentState.selectedItem = item;
        btnConfirm.disabled = true;

        previewPane.innerHTML = '<div class="preview-placeholder">加载中...</div>';

        try {
            // item is the search index object.
            // We need to pass identifier. 
            // Kiwee plugin uses 'u' (e.g. name_source) as ID.
            const id = item.u;

            // For now Kiwee plugin returns HTML string or JSON string
            const result = await importer.getDetail(currentState.source, currentState.type, id);

            // Format check
            if (typeof result === 'string') {
                currentState.previewHtml = result; // HTML or JSON string
            } else {
                currentState.previewHtml = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
            }

            // Normalize HTML for preview
            // If it is JSON (starting with {), maybe try to pretty print or render?
            // Kiwee plugin currently returns:
            // Spell: HTML string
            // Others: JSON string <pre>...

            previewPane.innerHTML = currentState.previewHtml;
            btnConfirm.disabled = false;
        } catch (e) {
            console.error(e);
            previewPane.innerHTML = `<div class="preview-placeholder error">加载失败: ${e.message}</div>`;
        }
    }

    function importSelection() {
        if (!currentState.selectedItem || !currentState.previewHtml) return;

        // Insert into editor
        const editor = document.getElementById('editor');
        editor.focus();

        // Use execCommand for undo support
        // We might want to wrap it in a container?
        // The data likely already has a wrapper (e.g. .trpg-spell-card)

        // Note: insertHTML might insert at cursor.
        // If cursor is lost, it might insert at beginning or fail.
        // openModal should ideally save cursor range, but if clicking around, it's lost.
        // We can append to end if no selection?

        document.execCommand('insertHTML', false, currentState.previewHtml);
        document.execCommand('insertHTML', false, '<p><br></p>'); // Add spacing

        closeModal();

        // Trigger auto-save or input event
        editor.dispatchEvent(new Event('input', { bubbles: true }));

        // Toast
        // (Assuming renderToast or similar exists, if not just alert or console)
        console.log('Imported successfully');
    }

    // --- Events ---

    btnOpen.addEventListener('click', openModal);
    btnClose.addEventListener('click', closeModal);

    // Close on overlay click
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);

    // Source Select
    selectSource.addEventListener('change', (e) => {
        currentState.source = e.target.value;
        doSearch();
    });

    // Type Select
    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            typeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentState.type = btn.dataset.type;

            // Reset search/results?
            // Prefer re-searching with new type
            doSearch();
        });
    });

    // Search Input
    inputSearch.addEventListener('input', debounce(doSearch, 300));

    // Confirm
    btnConfirm.addEventListener('click', importSelection);
}
