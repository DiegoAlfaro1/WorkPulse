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
 * @property {string[]} tags                         from ApiPort
 * @property {User} me                             the signed-in user
 * @property {string} currentUserId
 * @property {User[]} members                        the users `me` may see (themself included)
 * @property {Array<{id, name}>} teams               admin: every team; others: their own
 * @property {(p: {name, client, billable, color}) => Promise<void>} addProject  rejects with the API's error message
 * @property {(name: string) => Promise<string>} addTag                 resolves to the stored tag name
 * @property {(u: {name, email, password, role, teams}) => Promise<void>} addUser
 * @property {(id: string, patch: {name?, role?, password?, teams?}) => Promise<void>} updateUser
 * @property {(id: string, active: boolean) => Promise<void>} setUserActive  deactivated users keep their entries but can't sign in
 * @property {(name: string) => Promise<void>} addTeam
 * @property {(id: string, name: string) => Promise<void>} renameTeam
 * @property {(id: string) => Promise<void>} removeTeam
 */

/** @typedef {{id: string, company: string|null, name, email, role: 'admin'|'manager'|'employee', teams: Array<{id: string, name}>, active: boolean}} User */

/**
 * @typedef {Object} ApiPort  every method rejects with an Error carrying the API's message and HTTP `status`
 * @property {(fn: () => void) => void} setUnauthorizedHandler      called when a signed-in request gets 401
 * @property {() => Promise<{user: User, impersonating: boolean}>} me  rejects with status 401 when signed out
 * @property {(email, password) => Promise<void>} login
 * @property {() => Promise<void>} logout
 * @property {(current, next) => Promise<void>} changePassword
 * @property {(userId: string) => Promise<void>} impersonate         super admin only; stopImpersonating goes back
 * @property {() => Promise<void>} stopImpersonating
 * @property {() => Promise<Array<{id: string, name, client, billable}>>} listProjects
 * @property {(p: {name, client, billable}) => Promise<{id: string, name, client, billable}>} createProject
 * @property {() => Promise<string[]>} listTags
 * @property {(name: string) => Promise<string>} createTag
 * @property {() => Promise<Object[]>} listEntries                 newest first, same shape as entryFromTimer + id
 * @property {(e: Object) => Promise<Object>} createEntry             rejects with the API's error message
 * @property {(id: string) => Promise<void>} deleteEntry              rejects with the API's error message
 * @property {() => Promise<User[]>} listUsers  / createUser / updateUser / setUserActive
 * @property {() => Promise<Array<{id, name}>>} listTeams  / createTeam / renameTeam / deleteTeam
 * @property {() => Promise<Array<{id, name, active}>>} listCompanies  / createCompany / setCompanyActive — super admin only
 */

/** @typedef {{ storage: StoragePort, catalog: CatalogPort, api: ApiPort }} Services */

export {};
