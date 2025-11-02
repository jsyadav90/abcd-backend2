// services/branchAssignment.service.js
import { User } from "../models/user.model.js";
import { Branch } from "../models/branch.model.js";
import mongoose from "mongoose";

/**
 * Assign or remove branches for a user
 * Returns branch info objects: { _id, branch }
 */
export const updateUserBranches = async (userId, branchIds, action) => {
  // basic input validation
  if (!userId || !Array.isArray(branchIds) || branchIds.length === 0) {
    return { success: false, message: "userId and branchIds (non-empty array) are required" };
  }
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return { success: false, message: "Invalid userId format" };
  }

  // only keep valid ObjectId strings
  const validBranchIds = branchIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validBranchIds.length === 0) {
    return { success: false, message: "No valid branch IDs provided" };
  }

  // load user
  const user = await User.findById(userId);
  if (!user) return { success: false, message: "User not found" };
  if (!Array.isArray(user.assignedBranches)) user.assignedBranches = [];
  const current = user.assignedBranches.map((b) => b.toString());

  // fetch branch docs for the IDs passed in (only those that exist)
  const branchDocs = await Branch.find({ _id: { $in: validBranchIds } }).lean();
  // helpful debug info if nothing found
  if (!branchDocs || branchDocs.length === 0) {
    return { success: false, message: "No branches found for provided IDs" };
  }

  // auto-detect which field to use as human-readable branch value
  // preference order: branchId, branchCode, branch, shortName, code, name
  const possibleFields = ["branchId", "branchCode", "branch", "shortName", "code", "name"];
  let chosenField = null;
  for (const f of possibleFields) {
    if (branchDocs[0] && Object.prototype.hasOwnProperty.call(branchDocs[0], f)) {
      chosenField = f;
      break;
    }
  }
  // fallback to 'name' if nothing detected
  if (!chosenField) chosenField = "name";

  // helper: convert array of ids -> array of { _id, branch } using chosenField
  const branchInfo = (ids) =>
    branchDocs
      .filter((b) => ids.includes(b._id.toString()))
      .map((b) => ({ _id: b._id.toString(), branch: b[chosenField] ?? b.name ?? b._id.toString() }));

  // ASSIGN
  if (action === "assign") {
    const alreadyAssigned = validBranchIds.filter((id) => current.includes(id.toString()));
    const newBranches = validBranchIds.filter((id) => !alreadyAssigned.includes(id));

    if (newBranches.length === 0) {
      return {
        success: false,
        message:
          alreadyAssigned.length === 1
            ? "This branch is already assigned to the user"
            : "All provided branches are already assigned to the user",
        alreadyAssigned: branchInfo(alreadyAssigned),
      };
    }

    user.assignedBranches.push(...newBranches);
    await user.save();

    // re-populate assigned branches for response using chosenField
    const updated = await User.findById(userId).populate("assignedBranches").lean();
    // because populated docs may be plain objects or ObjectIds, build safe remainingAssigned
    const remainingAssigned = (updated.assignedBranches || []).map((b) => {
      if (typeof b === "object") {
        return { id: b._id?.toString() ?? b.toString(), branch: b[chosenField] ?? b.name ?? b._id?.toString() };
      }
      return { id: b.toString(), branch: b.toString() };
    });

    return {
      success: true,
      message:
        alreadyAssigned.length > 0
          ? `Some branches were already assigned (${alreadyAssigned.length}), others added successfully.`
          : "Branch(es) assigned successfully",
      data: {
        newlyAssigned: branchInfo(newBranches),
        alreadyAssigned: branchInfo(alreadyAssigned),
        assignedBranches: remainingAssigned,
      },
    };
  }

  // REMOVE
  if (action === "remove") {
    const branchesToRemove = validBranchIds.filter((id) => current.includes(id.toString()));
    if (branchesToRemove.length === 0) {
      return {
        success: false,
        message:
          validBranchIds.length === 1 ? "This branch is not assigned to the user" : "None of the provided branches are assigned to the user",
      };
    }

    user.assignedBranches = user.assignedBranches.filter((b) => !branchesToRemove.includes(b.toString()));
    await user.save();

    const updated = await User.findById(userId).populate("assignedBranches").lean();
    const remainingAssigned = (updated.assignedBranches || []).map((b) => {
      if (typeof b === "object") {
        return { id: b._id?.toString() ?? b.toString(), branch: b[chosenField] ?? b.name ?? b._id?.toString() };
      }
      return { id: b.toString(), branch: b.toString() };
    });

    return {
      success: true,
      message: branchesToRemove.length === 1 ? "Branch unassigned successfully" : "Branches unassigned successfully",
      data: {
        removedBranches: branchInfo(branchesToRemove),
        remainingAssigned,
      },
    };
  }

  return { success: false, message: "Invalid action type" };
};
