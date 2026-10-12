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
 * @property {string[]} tags                         from CatalogApiPort
 * @property {Array<{id, name, role}>} members
 * @property {string} currentUserId
 * @property {(p: {name, client, billable}) => Promise<void>} addProject  rejects with the API's error message
 * @property {(name: string) => Promise<string>} addTag                 resolves to the stored tag name
 */

/**
 * @typedef {Object} CatalogApiPort
 * @property {() => Promise<Array<{id: string, name, client, billable}>>} listProjects
 * @property {(p: {name, client, billable}) => Promise<{id: string, name, client, billable}>} createProject
 * @property {() => Promise<string[]>} listTags
 * @property {(name: string) => Promise<string>} createTag
 */

/** @typedef {{ storage: StoragePort, catalog: CatalogPort, api: CatalogApiPort }} Services */

export {};
