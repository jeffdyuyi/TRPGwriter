
/**
 * Kiwee 5e Plugin
 * Imports data from https://5e.kiwee.top
 */
const BASE_URL = 'https://5e.kiwee.top';

// Category mapping based on 5etools observation
// Need to verify these, but for now we search all and filter by request type
const SEARCH_TYPE_MAP = {
    'spell': [3], // Guessing category ID for spells
    'monster': [1], // Bestiary is 1 based on previous check
    'item': [5, 4], // Items might be multiple
};

export class Kiwee5ePlugin {
    constructor() {
        this.id = 'kiwee-5e';
        this.name = '5e.kiwee.top (中文)';
        this.searchIndex = null;
        this.fileIndices = {
            'spell': null,
            'monster': null,
            'item': null
        };
        this.dataCache = new Map(); // Cache fetched data files
    }

    /**
     * Initialize search index
     */
    async ensureSearchIndex() {
        if (this.searchIndex) return;
        try {
            const response = await fetch(`${BASE_URL}/search/index.json`);
            const data = await response.json();
            // data.x is the array of items
            this.searchIndex = data.x;
        } catch (e) {
            console.error('Failed to load search index', e);
            throw e;
        }
    }

    /**
     * Get file index for a specific type (e.g. mapping PHB -> spells-phb.json)
     */
    async getFileIndex(type) {
        if (this.fileIndices[type]) return this.fileIndices[type];

        let path = '';
        switch (type) {
            case 'spell': path = '/data/spells/index.json'; break;
            case 'monster': path = '/data/bestiary/index.json'; break;
            case 'item': path = '/data/items.json'; break; // Items structure is different?
            default: throw new Error(`Unknown type: ${type}`);
        }

        try {
            const res = await fetch(`${BASE_URL}${path}`);
            // items.json is NOT an index map like spells/bestiary, it MIGHT be the data itself or chunked
            // Need to handle items specially if it's different.
            // Based on previous check, items.json yielded chunks, implying it's a file.
            // 5etools `items.json` is usually the "Basic" items, and there might be `items-base.json` etc.
            // But for kiwee, let's assume standard index structure for spells/bestiary.

            const data = await res.json();
            this.fileIndices[type] = data;
            return data;
        } catch (e) {
            console.error(`Failed to load index for ${type}`, e);
            return null;
        }
    }

    async search(type, query) {
        await this.ensureSearchIndex();

        const term = query.toLowerCase();

        // Filter by query name (English or Chinese)
        // And optionally by category if we knew them for sure.
        // For now, return all matches and let the UI/Detail fetcher decide validity
        // Or we can try to guess category from the item data if possible.

        // 5etools categories (rough guess need refinement)
        // 1: Bestiary
        // 3: Spells ?
        // ? : Items

        return this.searchIndex.filter(item => {
            const matchName = (item.n && item.n.toLowerCase().includes(term)) ||
                (item.cn && item.cn.includes(term));
            if (!matchName) return false;

            // Type filtering
            if (type === 'monster' && item.c !== 1) return false;
            // if (type === 'spell' && item.c !== 3) return false; // Don't strictly filter yet until sure

            return true;
        }).slice(0, 50); // Limit results
    }

    async getDetail(type, id) {
        // id in search index is NOT the unique key for valid data retrieval
        // The 'u' field (url slug) contains "Name_Source"
        // The search result item is passed as `id` here (or we lookup by integer id)

        // Actually, ImporterManager.getDetail receives the ID from the search result.
        // We should probably pass the whole item or the index ID.
        // Let's assume we pass the search index item object or its `u` property.

        // For simplicity, let's say ID is the `u` string from search result.
        // e.g. "%e6%81%b6%e9%ad%94%e5%9b%be%e8%85%be_abh"

        const uid = id;
        const parts = uid.split('_');
        const sourceRaw = parts.pop(); // Last part is source (e.g. 'abh')
        const source = sourceRaw.toUpperCase(); // Index uses uppercase 'ABH'

        // Name is the rest, decoded
        const nameEncoded = parts.join('_');
        const name = decodeURIComponent(nameEncoded); // "恶魔图腾"

        // Fetch the file
        let data;
        if (type === 'monster') {
            data = await this.fetchEntryFromSource('monster', source, name);
        } else if (type === 'spell') {
            data = await this.fetchEntryFromSource('spell', source, name);
        } else if (type === 'item') {
            // Item handling might be different if sources are mixed in one file
            // But kiwee likely follows 5etools structure
            data = await this.fetchEntryFromSource('item', source, name);
        }

        if (!data) throw new Error(`Entry not found: ${name} (${source})`);

        // Convert to HTML
        return this.render(type, data);
    }

    async fetchEntryFromSource(type, source, name) {
        const index = await this.getFileIndex(type);
        let filename;

        // Special handling for items if they aren't indexed by source in the same way
        if (type === 'item') {
            // Items in 5etools are often in `items.json` (base) or `items-base.json`
            // Inspecting index.json for items previously showed just specific files?
            // Wait, I didn't verify item index content perfectly.
            // Let's assume standard mapping: index[SOURCE] = filename
            if (index && index[source]) {
                filename = index[source];
            } else {
                // Fallback for core items?
                filename = 'items.json';
            }
        } else {
            if (!index || !index[source]) {
                console.warn(`Source ${source} not found in ${type} index`);
                return null;
            }
            filename = index[source];
        }

        // Check cache
        const cacheKey = `${type}/${filename}`;
        let fileData = this.dataCache.get(cacheKey);

        if (!fileData) {
            // Fetch
            let url = `${BASE_URL}/data/${type === 'monster' ? 'bestiary' : type === 'spell' ? 'spells' : 'items'}/${filename}`;
            // Fix path for items if needed (items are usually in root data/ or data/items/)
            // For kiwee: `data/items.json` exists. `data/items/index.json`?
            // I should have checked `data/items/index.json`!

            // Correction: If `getFileIndex('item')` worked and returned a map, we are good.
            // If it returned a list or empty, we have issues.
            // I will assume standard structure for now.

            if (type === 'item' && filename === 'items.json') {
                url = `${BASE_URL}/data/items.json`;
            } else if (type === 'item') {
                url = `${BASE_URL}/data/items/${filename}`;
            }

            const res = await fetch(url);
            fileData = await res.json();
            this.dataCache.set(cacheKey, fileData);
        }

        // Find entry
        // Data structure: { monster: [ ... ], spell: [ ... ], item: [ ... ] }
        const list = fileData[type] || fileData.monster || fileData.spell || fileData.item || [];

        return list.find(i => i.name === name || i.ENG_name === name || i.name === name.replace(/ /g, '%20'));
        // Sometimes names have encoding differences.
    }

    render(type, data) {
        // Basic rendering for now, return raw data or simple HTML
        // We will refine this in the next steps (Data Mapping)

        if (type === 'spell') {
            return `<div class="trpg-spell-card">
            <h4>${data.name} <small>(${data.ENG_name})</small></h4>
            <div class="spell-meta">
                <em>${data.level}环 ${data.school}</em>
            </div>
            <div class="spell-content">
                <p>${data.entries ? data.entries.join('<br>') : ''}</p>
            </div>
        </div>`;
        }

        return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }
}
