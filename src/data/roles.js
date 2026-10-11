import { supabase } from '../lib/supabaseClient';

// ============================================================
//  ROLES — owner-only management of role definitions + permissions.
// ============================================================
function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'role';
}

export async function createRole({ label, permissions }) {
  const name = slugify(label);
  const { error } = await supabase.from('roles').insert({ name, label: label.trim(), permissions: permissions || [], is_system: false });
  if (error) throw error;
}

export async function updateRolePermissions(id, permissions) {
  const { error } = await supabase.from('roles').update({ permissions }).eq('id', id);
  if (error) throw error;
}

export async function deleteRole(id) {
  const { error } = await supabase.from('roles').delete().eq('id', id);
  if (error) throw error;
}
