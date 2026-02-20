
/**
 * Kiwee 5e Plugin
 * Imports data from https://5e.kiwee.top
 */
const BASE_URL = 'https://5e.kiwee.top';

const SEARCH_TYPE_MAP = {
    'spell': [3],
    'monster': [1],
    'item': [5, 4], // Items might be multiple
};

const SCHOOL_MAP = {
    'A': '防护', 'C': '咒法', 'D': '预言', 'E': '附魔',
    'V': '塑能', 'I': '幻术', 'N': '死灵', 'T': '变化'
};

const SIZE_MAP = {
    'T': '微型', 'S': '小型', 'M': '中型', 'L': '大型',
    'H': '巨型', 'G': '超巨', 'C': '巨像'
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

        // Filter
        let results = this.searchIndex.filter(item => {
            // Type filtering
            if (type === 'monster' && item.c !== 1) return false;
            // Spells are usually category 3, but let's be lenient if we are not sure
            if (type === 'spell' && (item.c !== 3 && item.c !== 2)) return false;
            // Items: 5?
            if (type === 'item' && (item.c === 1 || item.c === 3)) return false;

            if (isBrowse) return true;

            const matchName = (item.n && item.n.toLowerCase().includes(term)) ||
                (item.cn && item.cn.includes(term));
            return matchName;
        });

        // If browsing, maybe sort?
        // Or just slice
        return results.slice(0, 100);
    }

    async getDetail(type, id) {
        const uid = id;
        const parts = uid.split('_');
        const sourceRaw = parts.pop(); // Last part is source (e.g. 'abh')
        const source = sourceRaw.toUpperCase(); // Index uses uppercase 'ABH'

        // Name is the rest, decoded
        const nameEncoded = parts.join('_');
        const name = decodeURIComponent(nameEncoded);

        // Fetch the file
        let data;
        if (type === 'monster') {
            data = await this.fetchEntryFromSource('monster', source, name);
        } else if (type === 'spell') {
            data = await this.fetchEntryFromSource('spell', source, name);
        } else if (type === 'item') {
            data = await this.fetchEntryFromSource('item', source, name);
        }

        if (!data) throw new Error(`Entry not found: ${name} (${source})`);

        // Convert to HTML
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

        // Check cache
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
        // Helper to normalize strings for comparison
        const norm = (s) => s ? s.toLowerCase().trim() : '';
        const target = norm(name);

        return list.find(i => norm(i.name) === target || norm(i.ENG_name) === target || norm(i.name) === norm(name.replace(/ /g, '%20')));
    }

    render(type, data) {
        if (type === 'monster') return this.renderMonster(data);
        if (type === 'spell') return this.renderSpell(data);
        if (type === 'item') return this.renderItem(data);
        return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }

    // ---- Renderers ----

    renderMonster(data) {
        const getMod = (score) => Math.floor((score - 10) / 2);
        const fmtMod = (score) => {
            const m = getMod(score || 10);
            return `${score || 10}(${m >= 0 ? '+' : ''}${m})`;
        };

        const typeStr = typeof data.type === 'string' ? data.type : (data.type.type || 'unknown');
        const align = typeof data.alignment === 'object' ? data.alignment.join(' ') : (data.alignment || '无阵营');
        const ac = data.ac ? (data.ac[0] && (data.ac[0].ac || data.ac[0])) : 10;
        const hp = data.hp ? (data.hp.average || data.hp.avg || '') : '';
        const hpFormula = data.hp ? (data.hp.formula || '') : '';
        const speed = data.speed ? (typeof data.speed === 'string' ? data.speed : Object.entries(data.speed).map(([k, v]) => `${k} ${v}尺`).join(', ')) : '';

        // Abilities
        const statsHtml = `<table><thead><tr><th>力量</th><th>敏捷</th><th>体质</th><th>智力</th><th>感知</th><th>魅力</th></tr></thead>
    <tbody><tr><td>${fmtMod(data.str)}</td><td>${fmtMod(data.dex)}</td><td>${fmtMod(data.con)}</td><td>${fmtMod(data.int)}</td><td>${fmtMod(data.wis)}</td><td>${fmtMod(data.cha)}</td></tr></tbody></table>`;

        // Traits/Actions
        const renderEntries = (entries) => {
            if (!entries) return '';
            return entries.map(e => {
                if (typeof e === 'string') return `<p>${e}</p>`;
                const name = e.name ? `<strong><em>${e.name}。</em></strong>` : '';
                const text = e.entries ? e.entries.join(' ') : (e.entries || ''); // handling varied structure
                return `<p>${name} ${text}</p>`;
            }).join('');
        };

        return `<div class="trpg-stat-block" contenteditable="true">
    <h3>${data.name} <small>(${data.ENG_name || ''})</small></h3>
    <p class="stat-subtitle"><em>${SIZE_MAP[data.size] || data.size} ${typeStr}，${align}</em></p>
    <p class="stat-line"><strong>护甲等级</strong> ${ac}</p>
    <p class="stat-line"><strong>生命值</strong> ${hp} (${hpFormula})</p>
    <p class="stat-line"><strong>速度</strong> ${speed}</p>
    ${statsHtml}
    <p class="stat-line"><strong>感官</strong> 被动感知 ${data.passive || 10}</p>
    <p class="stat-line"><strong>语言</strong> ${data.languages ? data.languages.join(', ') : '—'}</p>
    <p class="stat-line"><strong>挑战等级</strong> ${data.cr || '—'}</p>
    <hr>
    ${renderEntries(data.trait)}
    ${data.action ? `<h4>动作</h4>${renderEntries(data.action)}` : ''}
    ${data.reaction ? `<h4>反应</h4>${renderEntries(data.reaction)}` : ''}
    ${data.legendary ? `<h4>传奇动作</h4>${renderEntries(data.legendary)}` : ''}
    </div>`;
    }

    renderSpell(data) {
        const levelStr = data.level === 0 ? '戏法' : `${data.level}环`;
        const school = SCHOOL_MAP[data.school] || data.school;
        const meta = `${levelStr} ${school}${data.meta && data.meta.ritual ? '（仪式）' : ''}`;

        // Components
        let comps = '';
        if (data.components) {
            if (data.components.v) comps += 'V';
            if (data.components.s) comps += (comps ? ', ' : '') + 'S';
            if (data.components.m) comps += (comps ? ', ' : '') + 'M' + (typeof data.components.m === 'object' ? `（${data.components.m.text || JSON.stringify(data.components.m)}）` : '');
        }

        // Duration
        let dur = '';
        if (data.duration) {
            const d = data.duration[0];
            if (d.type === 'instant') dur = '瞬间';
            else if (d.type === 'timed') dur = `${d.concentration ? '专注，' : ''}${d.duration.amount} ${d.duration.type}`;
            else dur = d.type;
        }

        const entries = data.entries ? data.entries.map(e => `<p>${e}</p>`).join('') : '';

        return `<div class="trpg-spell-card" contenteditable="true">
      <h4>${data.name} <small>(${data.ENG_name})</small></h4>
      <p class="spell-meta">${meta}</p>
      <p class="spell-props"><strong>施法时间：</strong>${data.time ? `${data.time[0].number} ${data.time[0].unit}` : ''}</p>
      <p class="spell-props"><strong>施法距离：</strong>${data.range ? `${data.range.distance.amount || ''} ${data.range.distance.type}` : ''}</p>
      <p class="spell-props"><strong>法术成分：</strong>${comps}</p>
      <p class="spell-props"><strong>持续时间：</strong>${dur}</p>
      <div class="spell-content">${entries}</div>
    </div>`;
    }

    renderItem(data) {
        const rarity = data.rarity || '';
        const type = data.wondrous ? '奇物' : (data.type || '物品');
        const attune = data.reqAttune ? '（需同调）' : '';

        // Flatten entries
        const renderEntry = (e) => {
            if (typeof e === 'string') return `<p>${e}</p>`;
            if (e.type === 'list') return `<ul>${e.items.map(i => `<li>${i}</li>`).join('')}</ul>`;
            return `<p><strong>${e.name || ''}</strong> ${e.entries ? e.entries.join(' ') : ''}</p>`;
        };

        const entries = data.entries ? data.entries.map(renderEntry).join('') : '';

        return `<div class="trpg-item-card" contenteditable="true">
      <h4>${data.name} <small>(${data.ENG_name || ''})</small></h4>
      <p class="item-meta">${type}，${rarity}${attune}</p>
      <div class="item-content">${entries}</div>
    </div>`;
    }
}
