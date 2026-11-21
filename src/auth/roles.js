// Roles that may open the staff workspace.
export const STAFF_ROLES = ['staff', 'manager', 'owner']

// Roles that may open the management pages (tables, settings, accounts, reports, import).
export const ADMIN_ROLES = ['manager', 'owner']

// Where each role lands after logging in. Every role starts at the live dashboard (floor view).
export function homeFor() {
  return '/staff/dashboard'
}
