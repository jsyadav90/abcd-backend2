import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Enterprise } from "../models/enterprise.model.js";

/**
 * 🏗️ Create new Enterprise
 */
export const createEnterprise = asyncHandler(async (req, res) => {
  const { enterpriseName, description } = req.body;
  // const admin = req.user; // from auth middleware

  // if (!admin) throw new apiError(401, "Unauthorized");

  if (!enterpriseName || !enterpriseName.trim()) {
    throw new apiError(400, "Enterprise name is required");
  }

  const existing = await Enterprise.findOne({ enterpriseName: enterpriseName.toUpperCase() });
  if (existing) throw new apiError(409, "Enterprise with this name already exists");

  const enterprise = await Enterprise.create({
    enterpriseName: enterpriseName.trim().toUpperCase(),
    description,
    // createdBy: admin._id,
  });

  return res
    .status(201)
    .json(new apiResponse(201, enterprise, "Enterprise created successfully"));
});

/**
 * 📋 Get all enterprises
 */
export const getAllEnterprises = asyncHandler(async (req, res) => {
  const enterprises = await Enterprise.find().sort({ createdAt: -1 });
  return res
    .status(200)
    .json(new apiResponse(200, enterprises, "Enterprises fetched successfully"));
});

/**
 * ✏️ Update enterprise
 */
export const updateEnterprise = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { enterpriseName, description, isActive } = req.body;
  const admin = req.user;

  const enterprise = await enterprise.findById(id);
  if (!enterprise) throw new apiError(404, "Enterprise not found");

  if (enterpriseName) enterprise.enterpriseName = enterpriseName.toUpperCase();
  if (description) enterprise.description = description;
  if (typeof isActive === "boolean") enterprise.isActive = isActive;
  enterprise.updatedBy = admin._id;

  await enterprise.save();
  return res
    .status(200)
    .json(new apiResponse(200, enterprise, "Enterprise updated successfully"));
});

/**
 * 🗑️ Delete enterprise
 */
export const deleteEnterprise = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const enterprise = await Enterprise.findById(id);
  if (!enterprise) throw new apiError(404, "Enterprise not found");

  await enterprise.deleteOne();
  return res
    .status(200)
    .json(new apiResponse(200, {}, "Enterprise deleted successfully"));
});
