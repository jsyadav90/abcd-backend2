import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
/* ============================================================
   🟢 REGISTER USER
============================================================ */
const registerUser = asyncHandler(async (req, res) => {
  const {
    userId,
    fullName,
    role,
    canLogin,
    username,
    password,
    phoneNo,
    email,
    department,
    designation,
    isActive,
    remarks,
    branch,
  } = req.body;

  const loginAllowed = canLogin === true || canLogin === "true";

  if (!userId?.trim()) throw new apiError(400, "User ID is required");
  if (!fullName?.trim()) throw new apiError(400, "Full Name is required");

  if (loginAllowed) {
    if (!username?.trim()) throw new apiError(400, "Username is required when login is allowed");
    if (!password?.trim()) throw new apiError(400, "Password is required when login is allowed");
  }

  if (email && await User.findOne({ email })) throw new apiError(409, "Email already exists");
  if (phoneNo && await User.findOne({ phoneNo })) throw new apiError(409, "Phone number already exists");
  if (loginAllowed && username && await User.findOne({ username: username.toLowerCase() })) {
    throw new apiError(409, "Username already exists");
  }

  const userData = {
    userId,
    fullName,
    role,
    branch,
    canLogin: loginAllowed,
    email,
    phoneNo,
    department,
    designation,
    isActive,
    remarks,
  };

  if (loginAllowed) {
    userData.username = username.toLowerCase();
    userData.password = password;
  }

  const user = await User.create(userData);
  const createdUser = await User.findById(user._id).select("-password -refreshToken");

  if (!createdUser) throw new apiError(500, "User registration failed");

  return res.status(201).json(new apiResponse(201, createdUser, "User registered successfully"));
});

/* ============================================================
   🔍 GET ALL USERS (exclude deleted)
============================================================ */
const getAllUsers = asyncHandler(async (req, res) => {
  const { isActive, role, branch, search } = req.query;

  const filter = { isDeleted: { $ne: true } };
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (role) filter.role = role;
  if (branch) filter.branch = branch;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(filter).select("-password -refreshToken").sort({ createdAt: -1 });

  return res.status(200).json(new apiResponse(200, users, "Users fetched successfully"));
});

/* ============================================================
   👁️ GET SINGLE USER BY ID
============================================================ */
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await User.findOne({ _id: id, isDeleted: { $ne: true } }).select("-password -refreshToken");

  if (!user) throw new apiError(404, "User not found");

  return res.status(200).json(new apiResponse(200, user, "User fetched successfully"));
});

/* ============================================================
   ✏️ UPDATE USER DETAILS
============================================================ */


const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const allowedFields = [
    "fullName",
    "role",
    "email",
    "phoneNo",
    "department",
    "designation",
    "branch",
    "remarks",
    "canLogin",
    "username",
    "password",
  ];

  // ✅ Extract only allowed fields
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  // ✅ Find existing user
  const existingUser = await User.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!existingUser) throw new apiError(404, "User not found");

  // ✅ Handle canLogin logic
  const newCanLogin =
    updates.canLogin !== undefined
      ? updates.canLogin === true || updates.canLogin === "true"
      : existingUser.canLogin;

  if (newCanLogin) {
    const usernameInDB = existingUser.username;
    const passwordInDB = existingUser.password;

    const usernameToUse = updates.username ?? usernameInDB;
    const passwordToUse = updates.password ?? passwordInDB;

    // ✅ Require username and password if both missing
    if (!usernameToUse)
      throw new apiError(400, "Username is required when login is allowed");
    if (!passwordToUse)
      throw new apiError(400, "Password is required when login is allowed");

    // ✅ Check for duplicate username if changed
    if (
      usernameToUse &&
      usernameToUse.toLowerCase() !== usernameInDB?.toLowerCase()
    ) {
      const duplicateUser = await User.findOne({
        username: usernameToUse.toLowerCase(),
        _id: { $ne: id },
      });
      if (duplicateUser) throw new apiError(409, "Username already exists");
    }

    updates.username = usernameToUse.toLowerCase();
    updates.canLogin = true;

    // ✅ If password provided (and new), hash it
    if (updates.password && updates.password !== passwordInDB) {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updates.password, salt);
    }
  }

  // ✅ If canLogin set to false, remove username/password
  if (updates.canLogin === false) {
    updates.username = undefined;
    updates.password = undefined;
  }

  // ✅ Update user
  const updatedUser = await User.findByIdAndUpdate(id, updates, {
    new: true,
  }).select("-password -refreshToken");

  if (!updatedUser) throw new apiError(404, "User not found or update failed");

  return res
    .status(200)
    .json(new apiResponse(200, updatedUser, "User updated successfully"));
});





/* ============================================================
   🚫 ENABLE / DISABLE USER
============================================================ */
const toggleUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!user) throw new apiError(404, "User not found");

  user.isActive = !user.isActive;
  await user.save();

  return res.status(200).json(
    new apiResponse(200, { id: user._id, isActive: user.isActive }, `User ${user.isActive ? "activated" : "disabled"} successfully`)
  );
});

/* ============================================================
   ❌ SOFT DELETE USER
============================================================ */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleter = req.user?._id || null; // optional if auth used

  const user = await User.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!user) throw new apiError(404, "User not found");

  user.isDeleted = true;
  user.deletedAt = new Date();
  user.deletedBy = deleter;

  await user.save();

  return res.status(200).json(
    new apiResponse(200, { id: user._id }, "User soft-deleted successfully")
  );
});

/* ============================================================
   🌿 GET USERS BY BRANCH (exclude deleted)
============================================================ */
const getUsersByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;

  const users = await User.find({ branch: branchId, isDeleted: { $ne: true } }).select("-password -refreshToken");

  if (!users.length) throw new apiError(404, "No users found for this branch");

  return res.status(200).json(new apiResponse(200, users, "Users fetched successfully"));
});

export {
  registerUser,
  getAllUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  getUsersByBranch,
};
