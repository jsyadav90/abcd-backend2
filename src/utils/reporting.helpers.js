// utils/reporting.helpers.js
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";

/**
 * Check for circular reporting: returns true if setting user -> reportingToId would create a loop.
 */
export const willCreateCircularReporting = async (userId, reportingToId) => {
  const visited = new Set();
  let current = reportingToId;

  while (current) {
    if (visited.has(current.toString())) return true;
    visited.add(current.toString());

    const nextUser = await User.findById(current).select("reportingTo");
    if (!nextUser || !nextUser.reportingTo) break;

    current = nextUser.reportingTo;
    if (current.toString() === userId.toString()) return true;
  }

  return false;
};


/**
 * Simple permission checker placeholder. Replace with your real permission logic.
 * loggedInUser is req.user (full User doc or minimal)
 */
export function ensureCanAssignReporting(loggedInUser) {
  // Example: allow enterprise admin or role with specific permission
  // Replace this with your role/permission lookup using UserRole permissions array
  if (!loggedInUser) throw new apiError(401, "Unauthorized");
  // Example simple check: allow only if roleName === 'admin' OR has a permission flag
  // If you have permissions in role.permissions check that here.
  // For now, we assume enterprise admins or users with isActive true can do assignment — update as needed.
  // If you want stricter checks, update this function.
  return true;
}
