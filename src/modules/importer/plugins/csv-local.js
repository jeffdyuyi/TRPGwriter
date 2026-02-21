
import { addCustomItem, searchCustomItems, clearCustomItems } from '../../../storage.js';
import { CommonRenderer } from '../renderer.js';

export class CsvLocalPlugin {
    constructor() {
        this.id = 'local-csv';
        this.name = '本地数据库 (CSV)';
    }

    async search(type, query) {
        // Query local DB
        const results = await searchCustomItems(type, query);
        // Map to search result format expected by UI
        return results.map(item => ({
            n: item.name,
            cn: item.name, // Local items usually name is enough, or use same
            u: item.id, // ID from IndexedDB
            source: 'LOCAL'
        }));
    }

    async getDetail(type, id) {
        // Search returns the full object in valid list
        // But getDetail is called with ID. 
        // Since searchCustomItems returns objects with 'id', we can reuse it
        // efficiently if we had a direct get. 
        // For now, we search again or refine storage.js to get by ID.
        // Actually searchCustomItems returns the full objects.
        // Let's implement a getCustomItem in storage or just filter here?
        // Optimization: UI passes the search result item? 
        // defined in ImporterUI: "const result = await importer.getDetail(..., id)"
        // We need to fetch it.

        // Let's add getCustomItem to storage.js? 
        // Or simply scan the search results since local DB is small?
        // Let's just use searchAll and find.
        const all = await searchCustomItems(type, '');
        const item = all.find(i => i.id == id); // match string/int
        if (!item) throw new Error('Item not found in local DB');
        return this.render(type, item);
    }

    render(type, data) {
        if (type === 'monster') return CommonRenderer.renderMonster(data);
        if (type === 'spell') return CommonRenderer.renderSpell(data);
        if (type === 'item') return CommonRenderer.renderItem(data);
        return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }

    // ---- CSV Management ----

    getTemplate(type) {
        const columns = this.getColumns(type);
        return columns.join(',') + '\n';
    }

    getColumns(type) {
        if (type === 'spell') return ['name', 'ENG_name', 'level', 'school', 'ritual', 'time', 'range', 'components', 'duration', 'entries'];
        if (type === 'monster') return ['name', 'ENG_name', 'type', 'size', 'alignment', 'ac', 'hp', 'speed', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'passive', 'languages', 'cr', 'trait', 'action', 'reaction', 'legendary'];
        if (type === 'item') return ['name', 'ENG_name', 'type', 'rarity', 'reqAttune', 'wondrous', 'entries'];
        return [];
    }

    async importCSV(type, csvText) {
        const rows = this.parseCSV(csvText);
        if (rows.length < 2) return 0; // Header only

        const headers = rows[0].map(h => h.trim());
        const expected = this.getColumns(type);

        // Basic validation
        // if (headers.join(',') !== expected.join(',')) throw new Error('CSV Header mismatch');

        let count = 0;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length < headers.length) continue;

            const obj = { type: type, source: 'LOCAL' };
            headers.forEach((h, idx) => {
                let val = row[idx];
                // Try parse numbers
                if (['level', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'passive'].includes(h)) {
                    val = parseInt(val) || 0;
                }
                // Parse booleans
                if (['ritual', 'wondrous', 'reqAttune'].includes(h)) {
                    val = (val === 'true' || val === 'TRUE' || val === '1');
                }
                // Assign
                obj[h] = val;
            });

            await addCustomItem(obj);
            count++;
        }
        return count;
    }

    // Roboust CSV Parser
    parseCSV(text) {
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (inQuotes) {
                if (char === '"') {
                    if (nextChar === '"') {
                        currentCell += '"';
                        i++; // Skip next quote
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentCell += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    currentRow.push(currentCell.trim());
                    currentCell = '';
                } else if (char === '\n' || char === '\r') {
                    if (char === '\r' && nextChar === '\n') i++;
                    currentRow.push(currentCell.trim());
                    if (currentRow.length > 0 || currentCell.length > 0) rows.push(currentRow);
                    currentRow = [];
                    currentCell = '';
                } else {
                    currentCell += char;
                }
            }
        }
        if (currentCell || currentRow.length > 0) {
            currentRow.push(currentCell.trim());
            rows.push(currentRow);
        }
        return rows;
    }
}
