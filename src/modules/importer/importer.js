/**
 * Importer Manager
 * Handles registration of import plugins and orchestrates data fetching.
 */
class ImporterManager {
    constructor() {
        this.plugins = new Map();
    }

    register(plugin) {
        if (!plugin.id || !plugin.name) {
            console.error('Plugin must have id and name');
            return;
        }
        this.plugins.set(plugin.id, plugin);
        console.log(`Plugin registered: ${plugin.name} (${plugin.id})`);
    }

    getPlugin(id) {
        return this.plugins.get(id);
    }

    getAllPlugins() {
        return Array.from(this.plugins.values());
    }

    /**
     * Search across a specific plugin
     * @param {string} pluginId 
     * @param {string} type - 'spell', 'monster', 'item', etc.
     * @param {string} query 
     * @returns {Promise<Array>} - List of search results
     */
    async search(pluginId, type, query) {
        const plugin = this.getPlugin(pluginId);
        if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
        return await plugin.search(type, query);
    }

    /**
     * Get details for a specific item
     * @param {string} pluginId 
     * @param {string} type 
     * @param {string} id - Item unique identifier from search result
     * @returns {Promise<Object>} - HTML content or data object
     */
    async getDetail(pluginId, type, id) {
        const plugin = this.getPlugin(pluginId);
        if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
        return await plugin.getDetail(type, id);
    }
}

export const importer = new ImporterManager();
