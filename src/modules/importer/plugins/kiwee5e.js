import { CommonRenderer } from '../renderer.js';

/**
 * Kiwee 5e Plugin
 * Imports data from https://5e.kiwee.top
 */
const BASE_URL = 'https://5e.kiwee.top';

const SEARCH_TYPE_MAP = {
    'spell': [3],
    'monster': [1],
    'item': [5, 4],
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
        this.dataCache = new Map();
    }

    async ensureSearchIndex() {
        if (this.searchIndex) return;
        try {
            const response = await fetch(`${BASE_URL}/search/index.json`);
            const data = await response.json();
            this.searchIndex = data.x;
        } catch (e) {
            console.error('Failed to load search index', e);
            throw e;
        }
    }

    async getFileIndex(type) {
        if (this.fileIndices[type]) return this.fileIndices[type];

        let path = '';
        switch (type) {
            case 'spell': path = '/data/spells/index.json'; break;
            case 'monster': path = '/data/bestiary/index.json'; break;
            case 'item': path = '/data/items.json'; break;
            default: throw new Error(`Unknown type: ${type}`);
        }

        try {
            const res = await fetch(`${BASE_URL}${path}`);
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

        const term = query ? query.toLowerCase() : '';
        const isBrowse = !term;

        let results = this.searchIndex.filter(item => {
            if (type === 'monster' && item.c !== 1) return false;
            if (type === 'spell' && item.c !== 3) return false; // B10: 仅允许法术类别
            if (type === 'item' && (item.c === 1 || item.c === 3)) return false;

            if (isBrowse) return true;

            const matchName = (item.n && item.n.toLowerCase().includes(term)) ||
                (item.cn && item.cn.includes(term));
            return matchName;
        });

        return results.slice(0, 100);
    }

    async getDetail(type, id) {
        const uid = id;
        const parts = uid.split('_');
        const sourceRaw = parts.pop();
        const source = sourceRaw.toUpperCase();

        const nameEncoded = parts.join('_');
        const name = decodeURIComponent(nameEncoded);

        let data;
        if (type === 'monster') {
            data = await this.fetchEntryFromSource('monster', source, name);
        } else if (type === 'spell') {
            data = await this.fetchEntryFromSource('spell', source, name);
        } else if (type === 'item') {
            data = await this.fetchEntryFromSource('item', source, name);
        }

        if (!data) throw new Error(`Entry not found: ${name} (${source})`);

        return this.render(type, data);
    }

    async fetchEntryFromSource(type, source, name) {
        const index = await this.getFileIndex(type);
        let filename;

        if (type === 'item') {
            if (index && index[source]) {
                filename = index[source];
            } else {
                filename = 'items.json';
            }
        } else {
            if (!index || !index[source]) {
                console.warn(`Source ${source} not found in ${type} index`);
                return null;
            }
            filename = index[source];
        }

        const cacheKey = `${type}/${filename}`;
        let fileData = this.dataCache.get(cacheKey);

        if (!fileData) {
            let url = `${BASE_URL}/data/${type === 'monster' ? 'bestiary' : type === 'spell' ? 'spells' : 'items'}/${filename}`;
            if (type === 'item' && filename === 'items.json') {
                url = `${BASE_URL}/data/items.json`;
            } else if (type === 'item') {
                url = `${BASE_URL}/data/items/${filename}`;
            }

            const res = await fetch(url);
            fileData = await res.json();
            this.dataCache.set(cacheKey, fileData);
        }

        const list = fileData[type] || fileData.monster || fileData.spell || fileData.item || [];
        const norm = (s) => s ? s.toLowerCase().trim() : '';
        const target = norm(name);

        return list.find(i => norm(i.name) === target || norm(i.ENG_name) === target || norm(i.name) === norm(name.replace(/ /g, '%20')));
    }

    render(type, data) {
        if (type === 'monster') return CommonRenderer.renderMonster(data);
        if (type === 'spell') return CommonRenderer.renderSpell(data);
        if (type === 'item') return CommonRenderer.renderItem(data);
        return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }
}
