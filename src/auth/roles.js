// The two roles. "admin" is the merged owner + manager role.
export const ROLES = ['staff', 'admin']

// Names shown on screen.
export const ROLE_LABEL = { staff: 'Staff', admin: 'Manager' }

// Roles that may open the staff workspace.
export const STAFF_ROLES = ['staff', 'admin']

// Roles that may open the management pages (tables, import, reports, accounts, settings).
export const ADMIN_ROLES = ['admin']

// Where each role lands after logging in. Every role starts at the live dashboard (floor view).
export function homeFor() {
  return '/staff/dashboard'
}
