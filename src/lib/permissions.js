// ============================================================
//  PERMISSIONS CATALOG
//  Feature keys a role can be granted. These gate the staff app's nav + actions
//  (UI-level). A role with ["*"] can do everything. 'client' is the baseline
//  for the client experience (not a staff feature).
// ============================================================
export const PERMISSION_CATALOG = [
  { key: 'members', label: 'Members', group: 'People' },
  { key: 'memberships', label: 'Memberships', group: 'People' },
  { key: 'plans', label: 'Plans', group: 'People' },
  { key: 'roles', label: 'Roles & Permissions', group: 'People' },
  { key: 'exercises', label: 'Exercise Library', group: 'Method' },
  { key: 'workouts', label: 'Workouts', group: 'Method' },
  { key: 'one-on-one', label: '1-on-1 Programs', group: 'Method' },
  { key: 'check-ins', label: 'Check-ins', group: 'Method' },
  { key: 'programs', label: 'Programs', group: 'Method' },
  { key: 'results', label: 'Results & Progress', group: 'Method' },
  { key: 'chat', label: 'Community Chat', group: 'Studio' },
  { key: 'finances', label: 'Cash & Expenses', group: 'Studio' },
  { key: 'reports', label: 'Financial Reports', group: 'Studio' },
  { key: 'comms', label: 'Communications', group: 'Studio' },
];

// Does the role (by name) grant this permission key? Owner / ["*"] → always.
export function roleCan(roleName, key, roles) {
  const role = (roles || []).find((r) => r.name === roleName);
  if (!role) return false;
  const perms = role.permissions || [];
  return perms.includes('*') || perms.includes(key);
}
