/**
 * TRPG写作工坊 — Markdown Parser with TRPG Extensions
 * 
 * Extends standard Markdown with:
 * - {{note ... }} blocks
 * - {{warning ... }} blocks
 * - {{stat-block ... }} blocks
 * - {{spell ... }} blocks
 * - {{item ... }} blocks  
 * - [[dice formula]] inline dice
 * - \page — page break
 * - \column — column break
 * - ==highlight== text
 * - {color:red} inline style injection
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked options
marked.setOptions({
    breaks: true,
    gfm: true
});

/**
 * Pre-process TRPG custom syntax before Markdown parsing
 * @param {string} text 
 * @returns {string}
 */
function preprocessTRPG(text) {
    // Process page breaks
    text = text.replace(/^\\page\s*$/gm, '\n<div class="preview-page-break"></div>\n');

    // Process column breaks
    text = text.replace(/^\\column\s*$/gm, '\n<div class="preview-column-break"></div>\n');

    // Process {{note ... }} blocks
    text = text.replace(/\{\{note\s*\n([\s\S]*?)\n\}\}/g, (_, content) => {
        return `<div class="trpg-note">\n\n${content}\n\n</div>`;
    });

    // Process {{warning ... }} blocks
    text = text.replace(/\{\{warning\s*\n([\s\S]*?)\n\}\}/g, (_, content) => {
        return `<div class="trpg-warning">\n\n${content}\n\n</div>`;
    });

    // Process {{stat-block ... }} blocks
    text = text.replace(/\{\{stat-block\s*\n([\s\S]*?)\n\}\}/g, (_, content) => {
        return `<div class="trpg-stat-block">\n\n${content}\n\n</div>`;
    });

    // Process {{spell ... }} blocks
    text = text.replace(/\{\{spell\s*\n([\s\S]*?)\n\}\}/g, (_, content) => {
        return `<div class="trpg-spell">\n\n${content}\n\n</div>`;
    });

    // Process {{item ... }} blocks
    text = text.replace(/\{\{item\s*\n([\s\S]*?)\n\}\}/g, (_, content) => {
        return `<div class="trpg-item">\n\n${content}\n\n</div>`;
    });

    // Process inline dice [[2d6+3]]
    text = text.replace(/\[\[(\d+d\d+(?:(?:kh|kl)\d+)?(?:\s*[+\-]\s*\d+)?)\]\]/gi, (_, formula) => {
        return `<span class="dice-roll" data-formula="${formula}" onclick="window.__rollInlineDice(this)" title="点击掷骰: ${formula}"><span class="dice-icon">🎲</span><span class="dice-formula">${formula}</span><span class="dice-result"></span></span>`;
    });

    // Process ==highlight== text
    text = text.replace(/==(.*?)==/g, '<mark>$1</mark>');

    // Process inline style injection {color:red,font-size:18px}
    // Applied to the preceding inline element
    text = text.replace(/\{([^{}]+)\}\s*$/gm, (match, styles) => {
        // Only process if it looks like CSS
        if (styles.includes(':')) {
            return `<!-- style:${styles} -->`;
        }
        return match;
    });

    return text;
}

/**
 * Post-process rendered HTML  
 * @param {string} html 
 * @returns {string}
 */
function postprocessHTML(html) {
    // Apply style injection comments
    html = html.replace(
        /(<[^>]+>)([\s\S]*?)<!-- style:([^>]+) -->/g,
        (_, tag, content, styles) => {
            // Add style to the preceding element
            if (tag.includes('style="')) {
                return tag.replace('style="', `style="${styles};`) + content;
            }
            return tag.replace('>', ` style="${styles}">`) + content;
        }
    );

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Fix nested HTML inside custom blocks
    html = html.replace(
        /<div class="trpg-note">\s*<p>\s*/g,
        '<div class="trpg-note">'
    );
    html = html.replace(
        /<div class="trpg-warning">\s*<p>\s*/g,
        '<div class="trpg-warning">'
    );

    return html;
}

/**
 * Render Markdown with TRPG extensions to HTML
 * @param {string} markdown 
 * @returns {string} Sanitized HTML
 */
export function renderMarkdown(markdown) {
    if (!markdown) return '';

    // 1. Pre-process TRPG custom syntax
    let processed = preprocessTRPG(markdown);

    // 2. Parse Markdown
    let html = marked.parse(processed);

    // 3. Post-process
    html = postprocessHTML(html);

    // 4. Sanitize (allow our custom classes and data attributes)
    html = DOMPurify.sanitize(html, {
        ADD_TAGS: ['mark', 'span', 'div'],
        ADD_ATTR: ['class', 'style', 'data-formula', 'onclick', 'title'],
        ALLOW_DATA_ATTR: true
    });

    return html;
}

/**
 * Get the text content for word count
 * @param {string} markdown 
 * @returns {number}
 */
export function getWordCount(markdown) {
    if (!markdown) return 0;
    // Remove markdown syntax
    const text = markdown
        .replace(/[#*_~`>|\-\[\]\(\){}\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    // Count Chinese characters + English words
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const english = (text.match(/[a-zA-Z]+/g) || []).length;
    return chinese + english;
}
