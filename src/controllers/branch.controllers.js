import { asyncHandler } from "../utils/asyncHandler.js";
import  {Branch}  from "../models/branch.model.js";

// ==============================
// CREATE NEW BRANCH
// ==============================
export const createBranch = asyncHandler(async (req, res) => {
  const { group, branchName, branchCode, address, city, phoneNo, email, remarks } = req.body;

  // Check for existing branch
  const existingBranch = await Branch.findOne({ $or: [{ branchCode }, { branchName }] });
  if (existingBranch) {
    res.status(400);
    throw new Error("Branch code or name already exists");
  }

  // If a file is uploaded, get its path
  let logoPath = null;
  if (req.file) {
    // Example: save relative path like "uploads/filename.jpg"
    logoPath = path.join("public/temp", req.file.filename);
  }

  // Create new branch
  const newBranch = await Branch.create({
    group,
    branchCode,
    branchName,
    address,
    city,
    phoneNo,
    email,
    remarks,
    logo: logoPath, // optional field
  });

  res.status(201).json({
    message: "Branch created successfully",
    branch: newBranch,
  });
});

// ==============================
// GET ALL BRANCHES
// ==============================
export const getAllBranches = asyncHandler(async (req, res) => {
  const branches = await Branch.find().sort({ branchName: 1 });
  res.status(200).json(branches);
});

// ==============================
// GET SINGLE BRANCH BY ID
// ==============================
export const getBranchById = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) {
    res.status(404);
    throw new Error("Branch not found");
  }
  res.status(200).json(branch);
});

// ==============================
// UPDATE BRANCH
// ==============================
export const updateBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) {
    res.status(404);
    throw new Error("Branch not found");
  }

  Object.assign(branch, req.body);
  const updatedBranch = await branch.save();
  res.status(200).json(updatedBranch);
});

// ==============================
// DELETE BRANCH
// ==============================
export const deleteBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) {
    res.status(404);
    throw new Error("Branch not found");
  }

  await branch.remove();
  res.status(200).json({ message: "Branch deleted successfully" });
});

// ==============================
// TOGGLE BRANCH STATUS (ACTIVE/INACTIVE)
// ==============================
export const toggleBranchStatus = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) {
    res.status(404);
    throw new Error("Branch not found");
  }

  branch.status = !branch.status;
  const updatedBranch = await branch.save();

  res.status(200).json({
    message: `Branch is now ${updatedBranch.status ? "active" : "inactive"}`,
    branch: updatedBranch,
  });
});
