/** Static vocabulary + the single local user. Projects/clients are user-created (see ServicesProvider). */
export const localCatalog = {
  tasks: ['Meeting', 'Design', 'Development', 'Code review', 'Research', 'Planning', 'Admin'],
  tags: ['client-call', 'standup', 'workshop', 'deep-work', 'bugfix', 'travel'],
  members: [{ id: 'm0', name: 'You', role: '' }],
  currentUserId: 'm0',
};
