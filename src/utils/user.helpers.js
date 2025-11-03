// utils/user.helpers.js
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";

/**
 * Prevent circular reporting: returns true if setting user -> reportingToId would create a loop.
 * @param {ObjectId} userId
 * @param {ObjectId} reportingToId
 * @returns {Promise<boolean>}
 */
export const willCreateCircularReporting = async (userId, reportingToId) => {
  if (!reportingToId) return false;
  let current = await User.findById(reportingToId).select("reportingTo");
  while (current && current.reportingTo) {
    if (current.reportingTo.toString() === userId.toString()) return true;
    current = await User.findById(current.reportingTo).select("reportingTo");
  }
  return false;
};

/**
 * Simple permission gate — replace with your real role/permission checks.
 * Throws apiError on unauthorized.
 * @param {User} loggedInUser
 */
export const ensureCanAssignReporting = (loggedInUser) => {
  if (!loggedInUser) throw new apiError(401, "Unauthorized");

  // Example minimal logic:
  // Allow enterprise admins (roleName === 'enterprise_admin') and users with specific permission.
  // If you store permissions in UserRole.permissions, check them here.
  // For now, allow if role exists and isActive. Customize as needed.
  // Example placeholder:
  // if (loggedInUser.role?.roleName !== "enterprise_admin") {
  //   throw new apiError(403, "You are not authorized to assign reporting authority");
  // }

  return true;
};
