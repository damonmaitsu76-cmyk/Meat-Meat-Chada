// Roles that may open the staff workspace.
export const STAFF_ROLES = ['staff', 'manager', 'owner']

// Where each role lands after logging in. Today every role starts at the request queue;
// when the dashboard exists, point it here (e.g. '/staff/dashboard').
export function homeFor() {
  return '/staff/requests'
}
