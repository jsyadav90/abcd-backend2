// controllers/reporting.controller.js
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import {asyncHandler} from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import {
  willCreateCircularReporting,
  ensureCanAssignReporting,
} from "../utils/user.helpers.js";

/**
 * Assign / clear reportingTo
 */
import { UserRole } from "../models/userRole.model.js";

export const assignReportingAuthority = asyncHandler(async (req, res) => {
  const { id } = req.params; // user to update
  const { reportingToId } = req.body;
  const loggedInUser = req.user; // from auth middleware

  // 🔹 Step 1: Find target user
  const user = await User.findById(id).populate("role", "roleName roleLevel branch");
  if (!user) throw new apiError(404, "Target user not found");

  // 🔹 Step 2: Clear reporting
  if (!reportingToId) {
    user.reportingTo = null;
    user.updatedBy = loggedInUser?._id || null;
    await user.save();
    return res.status(200).json({
      success: true,
      message: "Reporting authority cleared successfully",
      data: {
        _id: user._id,
        fullName: user.fullName,
        reportingTo: null,
      },
    });
  }

  // 🔹 Step 3: Find reporting authority user
  const reportingUser = await User.findById(reportingToId).populate([
    { path: "role", select: "roleName roleLevel" },
    { path: "branch", select: "branchName" },
  ]);
  if (!reportingUser) throw new apiError(404, "Reporting authority user not found");

  // ❌ Prevent self-reporting
  if (user._id.equals(reportingUser._id)) throw new apiError(400, "User cannot report to themselves");

  // ❌ Prevent circular reporting
  if (await willCreateCircularReporting(user._id, reportingUser._id))
    throw new apiError(400, "Circular reporting would be created");

  // 🔹 Step 4: Role hierarchy check
  if (reportingUser.role?.roleLevel >= user.role?.roleLevel) {
    throw new apiError(400, "Reporting authority must be senior (lower roleLevel number)");
  }

  // 🔹 Step 5: Branch check — optional (if required)
  const userBranchId = user.branch?.toString();
  const reportingUserBranchId = reportingUser.branch?._id?.toString() || reportingUser.branch?.toString();

  const reportingUserAssignedBranches = (reportingUser.assignedBranches || []).map(b => b.toString());
  const isSameBranch = userBranchId && reportingUserBranchId && userBranchId === reportingUserBranchId;
  const isInAssignedBranches = userBranchId && reportingUserAssignedBranches.includes(userBranchId);

  if (!isSameBranch && !isInAssignedBranches && reportingUser.role?.roleLevel > 10) {
    throw new apiError(400, "Reporting authority must be in same branch or assigned to this branch");
  }

  // 🔹 Step 6: Assign reporting
  user.reportingTo = reportingUser._id;
  user.updatedBy = loggedInUser?._id || null;
  await user.save();

  // 🔹 Step 7: Response
  const responseData = {
    _id: user._id,
    fullName: user.fullName,
    reportingTo: {
      _id: reportingUser._id,
      fullName: reportingUser.fullName,
      role: reportingUser.role?.roleName || null,
      branch: reportingUser.branch?.branchName || null,
    },
  };

  res.status(200).json({
    success: true,
    message: "Reporting authority assigned successfully",
    data: responseData,
  });
});


/**
 * Get upward chain (who this user reports to, recursively up to top)
 */
export const getReportingChainUp = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const root = await User.findById(id).populate([{ path: "role", select: "roleName" }, { path: "branch", select: "branchName" }]);
  if (!root) throw new apiError(404, "User not found");

  const chain = [];
  let current = root;
  while (current && current.reportingTo) {
    const manager = await User.findById(current.reportingTo).populate([{ path: "role", select: "roleName" }, { path: "branch", select: "branchName" }]);
    if (!manager) break;
    chain.push({
      _id: manager._id,
      fullName: manager.fullName,
      role: manager.role?.roleName || null,
      branch: manager.branch?.branchName || manager.branch?.toString() || null,
    });
    current = manager;
  }

  res.status(200).json({ success: true, data: chain });
});

/**
 * Get subordinates (downward tree) using aggregation $graphLookup
 */
export const getSubordinates = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // ✅ Correct way to create ObjectId
  const oid = new mongoose.Types.ObjectId(id);

  const result = await User.aggregate([
    { $match: { _id: oid } },
    {
      $graphLookup: {
        from: "users",           // collection name (matches your model name in lowercase plural)
        startWith: "$_id",
        connectFromField: "_id",
        connectToField: "reportingTo",
        as: "subordinates",
        depthField: "level",
      },
    },
    {
      $project: {
        _id: 1,
        fullName: 1,
        subordinates: {
          _id: 1,
          fullName: 1,
          role: 1,
          branch: 1,
          level: 1,
        },
      },
    },
  ]);

  if (!result || result.length === 0) throw new apiError(404, "User not found");

  res.status(200).json({
    success: true,
    message: "Subordinates fetched successfully",
    data: result[0],
  });
});


//! remove Reporting Authority
export const removeReportingAuthority = asyncHandler(async (req, res) => {
  const { id } = req.params; // user whose reporting needs to be cleared
  const loggedInUser = req.user; // from auth middleware

  // 1️⃣ Find target user
  const user = await User.findById(id)
    .populate([
      { path: "reportingTo", select: "fullName role branch" },
      { path: "role", select: "roleName roleLevel" },
    ]);

  if (!user) throw new apiError(404, "User not found");

  // 2️⃣ If already no reporting assigned
  if (!user.reportingTo) {
    return res.status(200).json({
      success: true,
      message: "No reporting authority to remove",
      data: {
        _id: user._id,
        fullName: user.fullName,
        reportingTo: null,
      },
    });
  }

  // 3️⃣ Optional — check permission
  // Example: only Admin or higher can remove
  if (loggedInUser.role?.roleLevel > 20) {
    throw new apiError(403, "Unauthorized: insufficient permission to remove reporting authority");
  }

  // 4️⃣ Clear reporting fields
  const oldReportingUser = user.reportingTo;
  user.reportingTo = null;
  user.updatedBy = loggedInUser?._id || null;
  await user.save();

  // 5️⃣ Response
  return res.status(200).json({
    success: true,
    message: `Reporting authority removed successfully. Previously reported to ${oldReportingUser?.fullName || "N/A"}`,
    data: {
      _id: user._id,
      fullName: user.fullName,
      reportingTo: null,
    },
  });
});




//! Recursive helper to build hierarchy
async function buildHierarchy(userId) {
  // Find the user
  const user = await User.findById(userId)
    .populate([
      { path: "role", select: "roleName" },
      { path: "branch", select: "branchName" },
    ])
    .lean();

  if (!user) return null;

  // Find all direct subordinates (those who report to this user)
  const subordinates = await User.find({ reportingTo: user._id })
    .populate([
      { path: "role", select: "roleName" },
      { path: "branch", select: "branchName" },
    ])
    .lean();

  // Recursively build subordinates tree
  const subordinateTrees = await Promise.all(
    subordinates.map((sub) => buildHierarchy(sub._id))
  );

  return {
    _id: user._id,
    fullName: user.fullName,
    role: user.role?.roleName || null,
    branch: user.branch?.branchName || null,
    subordinates: subordinateTrees.filter(Boolean),
  };
}

// Controller
export const getUserHierarchy = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new apiError(400, "Invalid user ID");

  const hierarchy = await buildHierarchy(id);
  if (!hierarchy) throw new apiError(404, "User not found");

  res.status(200).json({
    success: true,
    message: "Hierarchy fetched successfully",
    data: hierarchy,
  });
});
