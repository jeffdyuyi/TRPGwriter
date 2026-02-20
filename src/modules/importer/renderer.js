
/**
 * Shared Renderer for TRPG Content
 * Formats data objects into HTML for the editor
 */

const SCHOOL_MAP = {
    'A': '防护', 'C': '咒法', 'D': '预言', 'E': '附魔',
    'V': '塑能', 'I': '幻术', 'N': '死灵', 'T': '变化'
};

const SIZE_MAP = {
    'T': '微型', 'S': '小型', 'M': '中型', 'L': '大型',
    'H': '巨型', 'G': '超巨', 'C': '巨像'
};

export const CommonRenderer = {
    renderMonster(data) {
        const getMod = (score) => Math.floor((score - 10) / 2);
        const fmtMod = (score) => {
            const s = parseInt(score) || 10;
            const m = getMod(s);
            return `${s}(${m >= 0 ? '+' : ''}${m})`;
        };

        const typeStr = typeof data.type === 'string' ? data.type : (data.type?.type || 'unknown');
        const align = Array.isArray(data.alignment) ? data.alignment.join(' ') : (data.alignment || '无阵营');

        let ac = 10;
        if (data.ac) {
            if (Array.isArray(data.ac)) ac = data.ac[0].ac || data.ac[0];
            else ac = data.ac;
        }

        let hp = '', hpFormula = '';
        if (data.hp) {
            if (typeof data.hp === 'string') hp = data.hp; // CSV might give string
            else {
                hp = data.hp.average || data.hp.avg || '';
                hpFormula = data.hp.formula || '';
            }
        }

        const speed = data.speed ? (typeof data.speed === 'string' ? data.speed : Object.entries(data.speed).map(([k, v]) => `${k} ${v}尺`).join(', ')) : '';

        // Abilities
        const statsHtml = `<table><thead><tr><th>力量</th><th>敏捷</th><th>体质</th><th>智力</th><th>感知</th><th>魅力</th></tr></thead>
    <tbody><tr><td>${fmtMod(data.str)}</td><td>${fmtMod(data.dex)}</td><td>${fmtMod(data.con)}</td><td>${fmtMod(data.int)}</td><td>${fmtMod(data.wis)}</td><td>${fmtMod(data.cha)}</td></tr></tbody></table>`;

        // Traits/Actions
        const renderEntries = (entries) => {
            if (!entries) return '';
            // If it's a string (from CSV parsing perhaps), leave it
            if (typeof entries === 'string') return `<p>${entries}</p>`;

            return entries.map(e => {
                if (typeof e === 'string') return `<p>${e}</p>`;
                const name = e.name ? `<strong><em>${e.name}。</em></strong>` : '';
                const text = e.entries ? (Array.isArray(e.entries) ? e.entries.join(' ') : e.entries) : '';
                return `<p>${name} ${text}</p>`;
            }).join('');
        };

        // Parse JSON strings if coming from CSV
        const parseIfString = (val) => {
            if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
                try { return JSON.parse(val); } catch (e) { return val; }
            }
            return val;
        };

        const traits = parseIfString(data.trait);
        const actions = parseIfString(data.action);
        const reactions = parseIfString(data.reaction);
        const legendary = parseIfString(data.legendary);

        return `<div class="trpg-stat-block" contenteditable="true">
    <h3>${data.name} <small>(${data.ENG_name || ''})</small></h3>
    <p class="stat-subtitle"><em>${SIZE_MAP[data.size] || data.size} ${typeStr}，${align}</em></p>
    <p class="stat-line"><strong>护甲等级</strong> ${ac}</p>
    <p class="stat-line"><strong>生命值</strong> ${hp} ${hpFormula ? `(${hpFormula})` : ''}</p>
    <p class="stat-line"><strong>速度</strong> ${speed}</p>
    ${statsHtml}
    <p class="stat-line"><strong>感官</strong> 被动感知 ${data.passive || 10}</p>
    <p class="stat-line"><strong>语言</strong> ${Array.isArray(data.languages) ? data.languages.join(', ') : (data.languages || '—')}</p>
    <p class="stat-line"><strong>挑战等级</strong> ${data.cr || '—'}</p>
    <hr>
    ${Array.isArray(traits) ? renderEntries(traits) : (traits || '')}
    ${actions ? `<h4>动作</h4>${Array.isArray(actions) ? renderEntries(actions) : actions}` : ''}
    ${reactions ? `<h4>反应</h4>${Array.isArray(reactions) ? renderEntries(reactions) : reactions}` : ''}
    ${legendary ? `<h4>传奇动作</h4>${Array.isArray(legendary) ? renderEntries(legendary) : legendary}` : ''}
    </div>`;
    },

    renderSpell(data) {
        const levelStr = data.level == 0 ? '戏法' : `${data.level}环`; // Loose equality for string '0'
        const school = SCHOOL_MAP[data.school] || data.school;

        let meta = `${levelStr} ${school}`;
        if (data.meta && data.meta.ritual) meta += '（仪式）';
        if (data.ritual) meta += '（仪式）'; // CSV might have flat ritual boolean

        // Components
        let comps = '';
        if (data.components) {
            if (typeof data.components === 'string') comps = data.components;
            else {
                if (data.components.v) comps += 'V';
                if (data.components.s) comps += (comps ? ', ' : '') + 'S';
                if (data.components.m) comps += (comps ? ', ' : '') + 'M' + (typeof data.components.m === 'object' ? `（${data.components.m.text || JSON.stringify(data.components.m)}）` : '');
            }
        }

        // Duration
        let dur = '';
        if (data.duration) {
            if (typeof data.duration === 'string') dur = data.duration;
            else if (Array.isArray(data.duration)) {
                const d = data.duration[0];
                if (d.type === 'instant') dur = '瞬间';
                else if (d.type === 'timed') dur = `${d.concentration ? '专注，' : ''}${d.duration.amount} ${d.duration.type}`;
                else dur = d.type;
            }
        }

        // Time and Range
        let timeStr = '';
        if (data.time) {
            if (typeof data.time === 'string') timeStr = data.time;
            else if (Array.isArray(data.time)) timeStr = `${data.time[0].number} ${data.time[0].unit}`;
        }

        let rangeStr = '';
        if (data.range) {
            if (typeof data.range === 'string') rangeStr = data.range;
            else if (data.range.distance) rangeStr = `${data.range.distance.amount || ''} ${data.range.distance.type}`;
        }

        // Entries
        let entries = '';
        if (data.entries) {
            if (typeof data.entries === 'string') {
                // Try parsing JSON or treat as HTML/Text
                if (data.entries.startsWith('[')) {
                    try { entries = JSON.parse(data.entries).map(e => `<p>${e}</p>`).join(''); }
                    catch (e) { entries = `<p>${data.entries}</p>`; }
                } else {
                    entries = `<p>${data.entries}</p>`;
                }
            } else if (Array.isArray(data.entries)) {
                entries = data.entries.map(e => `<p>${e}</p>`).join('');
            }
        }

        return `<div class="trpg-spell-card" contenteditable="true">
      <h4>${data.name} <small>(${data.ENG_name || ''})</small></h4>
      <p class="spell-meta">${meta}</p>
      <p class="spell-props"><strong>施法时间：</strong>${timeStr}</p>
      <p class="spell-props"><strong>施法距离：</strong>${rangeStr}</p>
      <p class="spell-props"><strong>法术成分：</strong>${comps}</p>
      <p class="spell-props"><strong>持续时间：</strong>${dur}</p>
      <div class="spell-content">${entries}</div>
    </div>`;
    },

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

        let entries = '';
        if (data.entries) {
            if (typeof data.entries === 'string') {
                if (data.entries.startsWith('[')) {
                    try { entries = JSON.parse(data.entries).map(renderEntry).join(''); }
                    catch (e) { entries = `<p>${data.entries}</p>`; }
                } else {
                    entries = `<p>${data.entries}</p>`;
                }
            } else {
                entries = data.entries.map(renderEntry).join('');
            }
        }

        return `<div class="trpg-item-card" contenteditable="true">
      <h4>${data.name} <small>(${data.ENG_name || ''})</small></h4>
      <p class="item-meta">${type}，${rarity}${attune}</p>
      <div class="item-content">${entries}</div>
    </div>`;
    }
};
