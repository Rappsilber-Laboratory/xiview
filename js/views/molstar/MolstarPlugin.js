/**
 * @fileoverview Molstar plugin factory. Creates and manages a PluginContext instance
 * and mounts it into a target DOM element. Replaces NGL.Stage creation.
 */

import { PluginContext } from "molstar/lib/mol-plugin/context";
import { DefaultPluginSpec } from "molstar/lib/mol-plugin/spec";

let _plugin = null;
let _initPromise = null;

/**
 * Creates a Molstar PluginContext and mounts it into targetEl.
 * The plugin is stored as a module singleton.
 * @param {HTMLElement} targetEl - The container div to mount Molstar into (the #ngl div)
 * @returns {Promise<PluginContext>}
 */
export async function createMolstarPlugin(targetEl) {
    if (_plugin) {
        _plugin.dispose();
        _plugin = null;
        _initPromise = null;
    }

    const spec = DefaultPluginSpec();
    // Disable the default React-based UI panels — we only need the 3D canvas
    spec.layout = { initial: { isExpanded: false, showControls: false } };

    _plugin = new PluginContext(spec);
    _initPromise = _plugin.init();
    await _initPromise;

    // Mount creates a canvas element and appends it to targetEl
    _plugin.mount(targetEl);

    return _plugin;
}

/**
 * Returns the current PluginContext singleton.
 * @returns {PluginContext|null}
 */
export function getMolstarPlugin() {
    return _plugin;
}
