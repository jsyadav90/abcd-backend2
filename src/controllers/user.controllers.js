// controllers/user.controller.js
// import bcrypt from "bcrypt";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { User } from "../models/user.model.js";
import { UserLogin } from "../models/userLogin.model.js";

/* ============================================================
   🟢 REGISTER USER (auto link UserLogin if canLogin = true)
============================================================ */

export const registerUser = asyncHandler(async (req, res) => {
  const {
    userId,
    fullName,
    username,
    password,
    canLogin,
    phoneNo,
    email,
    role,
    branch,
    department,
    designation,
    isActive,
    remarks,
  } = req.body;

  const loginAllowed = canLogin === true || canLogin === "true";

  if (!userId?.trim()) throw new apiError(400, "User ID is required");
  if (!fullName?.trim()) throw new apiError(400, "Full Name is required");
  if (!role) throw new apiError(400, "Role is required");
  if (!branch) throw new apiError(400, "Branch is required");

  // ✅ Prevent duplicates
  if (email && await User.findOne({ email, isDeleted: { $ne: true } }))
    throw new apiError(409, "Email already exists");
  if (phoneNo && await User.findOne({ phoneNo, isDeleted: { $ne: true } }))
    throw new apiError(409, "Phone number already exists");

  // ✅ Create User
  const user = await User.create({
    userId,
    fullName,
    username: username?.toLowerCase(),
    role,
    branch,
    canLogin: loginAllowed,
    email,
    phoneNo,
    department,
    designation,
    isActive,
    remarks,
    createdBy: req.user?._id || null,
  });

  // ✅ Create login if allowed
  if (loginAllowed) {
    if (!username?.trim()) throw new apiError(400, "Username is required");
    if (!password?.trim()) throw new apiError(400, "Password is required");

    const existingLogin = await UserLogin.findOne({ username: username.toLowerCase() });
    if (existingLogin) throw new apiError(409, "Username already exists");

    await UserLogin.create({
      user: user._id,
      username: username.toLowerCase(),
      password,
    });
  }

  // ✅ Populate clean role & branch
  const createdUser = await User.findById(user._id)
    .populate("role", "roleName permissions")
    .populate("branch", "name");

  // ✅ Normalize permissions (auto-fix)
  if (createdUser.role?.permissions?.length) {
    createdUser.role.permissions = createdUser.role.permissions.map((perm) => {
      if (typeof perm === "string") {
        // Fix old-style string permissions
        return { action: perm, granted: true };
      } else if (perm.action) {
        // Already in correct format
        return {
          action: perm.action,
          granted: perm.granted ?? true,
          modifiedAt: perm.modifiedAt,
        };
      }
      return perm;
    });
  }

  return res
    .status(201)
    .json(new apiResponse(201, createdUser, "User registered successfully"));
});



/* ============================================================
   🔍 GET ALL USERS (with pagination + total)
============================================================ */
export const getAllUsers = asyncHandler(async (req, res) => {
  const { isActive, role, branch, search, page = 1, limit = 20 } = req.query;

  const filter = { isDeleted: { $ne: true } };
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (role) filter.role = role;
  if (branch) filter.branch = branch;
  if (search)
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
      { phoneNo: { $regex: search, $options: "i" } },
    ];

  const skip = (Number(page) - 1) * Number(limit);

  const [users, total] = await Promise.all([
    User.find(filter)
      .populate("role", "roleName")
      .populate("branch", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  return res.status(200).json(
    new apiResponse(200, { users, total, page: Number(page), limit: Number(limit) }, "Users fetched successfully")
  );
});

/* ============================================================
   👁️ GET SINGLE USER (with populated details)
============================================================ */
export const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ _id: id, isDeleted: { $ne: true } })
    .populate("role", "roleName permissions")
    .populate("branch", "name");

  if (!user) throw new apiError(404, "User not found");
  return res.status(200).json(new apiResponse(200, user, "User fetched successfully"));
});

/* ============================================================
   ✏️ UPDATE USER (sync login + user data)
============================================================ */
export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    fullName,
    email,
    phoneNo,
    department,
    designation,
    branch,
    remarks,
    role,
    canLogin,
    username,
    password,
  } = req.body;

  const user = await User.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!user) throw new apiError(404, "User not found");

  // ✅ Update base info
  if (fullName) user.fullName = fullName;
  if (email) user.email = email;
  if (phoneNo) user.phoneNo = phoneNo;
  if (department) user.department = department;
  if (designation) user.designation = designation;
  if (branch) user.branch = branch;
  if (remarks) user.remarks = remarks;
  if (role) user.role = role;

  // ✅ Handle login logic
  const loginDoc = await UserLogin.findOne({ user: user._id });

  if (canLogin === true || canLogin === "true") {
    user.canLogin = true;

    if (!username) throw new apiError(400, "Username required for login-enabled users");
    if (!password && !loginDoc) throw new apiError(400, "Password required for first-time login setup");

    if (loginDoc) {
      // Update existing login
      loginDoc.username = username.toLowerCase();
      if (password) loginDoc.password = password;
      await loginDoc.save();
    } else {
      // Create new login
      await UserLogin.create({
        user: user._id,
        username: username.toLowerCase(),
        password,
      });
    }
  } else {
    user.canLogin = false;
    if (loginDoc) await UserLogin.deleteOne({ user: user._id });
  }

  user.updatedBy = req.user?._id || null;
  await user.save();

  const updatedUser = await User.findById(user._id)
    .populate("role", "roleName")
    .populate("branch", "name");

  return res.status(200).json(new apiResponse(200, updatedUser, "User updated successfully"));
});

/* ============================================================
   🚫 ENABLE / DISABLE USER
============================================================ */
export const toggleUserStatus = asyncHandler(async (req, res) => {
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
export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!user) throw new apiError(404, "User not found");

  user.isDeleted = true;
  user.deletedAt = new Date();
  user.deletedBy = req.user?._id || null;
  await user.save();

  await UserLogin.deleteOne({ user: user._id });

  return res.status(200).json(new apiResponse(200, { id: user._id }, "User soft-deleted successfully"));
});

/* ============================================================
   ♻️ RESTORE USER (undo soft-delete)
============================================================ */
export const restoreUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ _id: id, isDeleted: true });
  if (!user) throw new apiError(404, "Deleted user not found");

  user.isDeleted = false;
  user.deletedAt = null;
  user.deletedBy = null;
  await user.save();

  return res.status(200).json(new apiResponse(200, user, "User restored successfully"));
});
