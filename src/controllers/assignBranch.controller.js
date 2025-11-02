// controllers/assignBranch.controller.js
import { updateUserBranches } from "../services/branchAssignment.service.js";

export const assignBranchesToUser = async (req, res) => {
  try {
    const { userId, branchIds } = req.body;
    const result = await updateUserBranches(userId, branchIds, "assign");
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error assigning branches:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const removeAssignedBranchesFromUser = async (req, res) => {
  try {
    const { userId, branchIds } = req.body;
    const result = await updateUserBranches(userId, branchIds, "remove");
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error removing branches:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
