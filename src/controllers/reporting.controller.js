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
export const assignReportingAuthority = asyncHandler(async (req, res) => {
  const { id } = req.params; // user to update
  const { reportingToId } = req.body;
  const loggedInUser = req.user; // from auth middleware

  // permission gate (customize inside helper)
  ensureCanAssignReporting(loggedInUser);

  // find target user
  const user = await User.findById(id);
  if (!user) throw new apiError(404, "Target user not found");

  // clear reporting
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

  // find reporting user and populate role & branch for response & checks
  const reportingUser = await User.findById(reportingToId).populate([
    { path: "role", select: "roleName" },
    { path: "branch", select: "branchName" },
  ]);
  if (!reportingUser) throw new apiError(404, "Reporting authority user not found");

  // prevent self-assign
  if (user._id.equals(reportingUser._id)) throw new apiError(400, "User cannot report to themselves");

  // prevent circular
  if (await willCreateCircularReporting(user._id, reportingUser._id))
    throw new apiError(400, "Circular reporting would be created");

  // Branch logic: allow if same branch OR reportingUser.assignedBranches includes user's branch
  const userBranchId = user.branch?.toString();
  const reportingUserBranchId = reportingUser.branch?._id?.toString() || reportingUser.branch?.toString();
  const reportingUserAssignedBranches = (reportingUser.assignedBranches || []).map(b => b.toString());

  const isSameBranch = userBranchId && reportingUserBranchId && userBranchId === reportingUserBranchId;
  const isInAssignedBranches = userBranchId && reportingUserAssignedBranches.includes(userBranchId);

  if (!isSameBranch && !isInAssignedBranches) {
    throw new apiError(400, "Reporting authority must be in the same branch or assigned to this user's branch");
  }

  // assign and save
  user.reportingTo = reportingUser._id;
  user.updatedBy = loggedInUser?._id || null;
  await user.save();

  // response format as requested
  const responseData = {
    _id: user._id,
    fullName: user.fullName,
    reportingTo: {
      fullName: reportingUser.fullName,
      role: reportingUser.role?.roleName || null,
      branch: reportingUser.branch?.branchName || reportingUser.branch?.toString() || null,
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

  // use raw mongoose.Types for aggregation id conversion
  const oid = mongoose.Types.ObjectId(id);
  const result = await User.aggregate([
    { $match: { _id: oid } },
    {
      $graphLookup: {
        from: "users",           // adjust if your collection name differs
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
          level: 1
        },
      },
    },
  ]);

  if (!result || result.length === 0) throw new apiError(404, "User not found");
  res.status(200).json({ success: true, data: result[0] });
});
