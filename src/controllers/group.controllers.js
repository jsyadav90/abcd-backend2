import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Group } from "../models/group.model.js";

/**
 * 🏗️ Create new group
 */
export const createGroup = asyncHandler(async (req, res) => {
  const { groupName, description } = req.body;
  // const admin = req.user; // from auth middleware

  // if (!admin) throw new apiError(401, "Unauthorized");

  if (!groupName || !groupName.trim()) {
    throw new apiError(400, "Group name is required");
  }

  const existing = await Group.findOne({ groupName: groupName.toUpperCase() });
  if (existing) throw new apiError(409, "Group with this name already exists");

  const group = await Group.create({
    groupName: groupName.trim().toUpperCase(),
    description,
    // createdBy: admin._id,
  });

  return res
    .status(201)
    .json(new apiResponse(201, group, "Group created successfully"));
});

/**
 * 📋 Get all groups
 */
export const getAllGroups = asyncHandler(async (req, res) => {
  const groups = await Group.find().sort({ createdAt: -1 });
  return res
    .status(200)
    .json(new apiResponse(200, groups, "Groups fetched successfully"));
});

/**
 * ✏️ Update group
 */
export const updateGroup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { groupName, description, isActive } = req.body;
  const admin = req.user;

  const group = await Group.findById(id);
  if (!group) throw new apiError(404, "Group not found");

  if (groupName) group.groupName = groupName.toUpperCase();
  if (description) group.description = description;
  if (typeof isActive === "boolean") group.isActive = isActive;
  group.updatedBy = admin._id;

  await group.save();
  return res
    .status(200)
    .json(new apiResponse(200, group, "Group updated successfully"));
});

/**
 * 🗑️ Delete group
 */
export const deleteGroup = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const group = await Group.findById(id);
  if (!group) throw new apiError(404, "Group not found");

  await group.deleteOne();
  return res
    .status(200)
    .json(new apiResponse(200, {}, "Group deleted successfully"));
});
