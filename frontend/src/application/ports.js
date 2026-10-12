// Ports: the shapes the application needs from the outside world.
// Adapters in src/infrastructure implement them; src/main.jsx wires them in.

/**
 * @typedef {Object} StoragePort
 * @property {(key: string, fallback: any) => any} load
 * @property {(key: string, value: any) => void} save
 */

/**
 * @typedef {Object} CatalogPort
 * @property {Record<string, string>} clients        client name -> name (derived from projects)
 * @property {Array<{id, name, client, billable, color}>} projects
 * @property {Record<string, Object>} projectById
 * @property {string[]} tasks
 * @property {string[]} tags
 * @property {Array<{id, name, role}>} members
 * @property {string} currentUserId
 * @property {(p: {name, client, billable}) => void} addProject  persists a user-created project
 */

/** @typedef {{ storage: StoragePort, catalog: CatalogPort }} Services */

export {};
