// controllers/user.controller.js
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { User } from "../models/user.model.js";
import { UserLogin } from "../models/userLogin.model.js";

/* ============================================================
   🟢 REGISTER USER (with optional login account)
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

  if (email && await User.findOne({ email })) throw new apiError(409, "Email already exists");
  if (phoneNo && await User.findOne({ phoneNo })) throw new apiError(409, "Phone number already exists");

  const user = await User.create({
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
  });

  if (loginAllowed) {
    if (!username?.trim()) throw new apiError(400, "Username required");
    if (!password?.trim()) throw new apiError(400, "Password required");

    if (await UserLogin.findOne({ username: username.toLowerCase() }))
      throw new apiError(409, "Username already exists");

    await UserLogin.create({
      user: user._id,
      username: username.toLowerCase(),
      password,
    });
  }

  const createdUser = await User.findById(user._id);
  return res.status(201).json(new apiResponse(201, createdUser, "User registered successfully"));
});

/* ============================================================
   🔍 GET ALL USERS
============================================================ */
const getAllUsers = asyncHandler(async (req, res) => {
  const { isActive, role, branch, search } = req.query;

  const filter = { isDeleted: { $ne: true } };
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (role) filter.role = role;
  if (branch) filter.branch = branch;
  if (search)
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];

  const users = await User.find(filter).sort({ createdAt: -1 });
  return res.status(200).json(new apiResponse(200, users, "Users fetched successfully"));
});

/* ============================================================
   👁️ GET SINGLE USER
============================================================ */
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await User.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!user) throw new apiError(404, "User not found");
  return res.status(200).json(new apiResponse(200, user, "User fetched successfully"));
});

/* ============================================================
   ✏️ UPDATE USER (sync login details if needed)
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

  // ✅ Pick only allowed fields
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  // ✅ Find user
  const existingUser = await User.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!existingUser) throw new apiError(404, "User not found");

  // ✅ Track if canLogin is being changed
  const canLoginModified = Object.prototype.hasOwnProperty.call(updates, "canLogin");

  // 🧩 If canLogin is being modified → enforce username/password rules
  if (canLoginModified) {
    const newCanLogin =
      updates.canLogin === true || updates.canLogin === "true";

    if (newCanLogin) {
      const usernameInDB = existingUser.username;
      const passwordInDB = existingUser.password;

      const usernameToUse = updates.username ?? usernameInDB;
      const passwordToUse = updates.password ?? passwordInDB;

      if (!usernameToUse)
        throw new apiError(400, "Username is required when enabling login");
      if (!passwordToUse)
        throw new apiError(400, "Password is required when enabling login");

      // ✅ Check duplicate username if changed
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

      // ✅ Hash password if provided and changed
      if (updates.password && updates.password !== passwordInDB) {
        const salt = await bcrypt.genSalt(10);
        updates.password = await bcrypt.hash(updates.password, salt);
      }
    } else {
      // 🚫 If disabling login → clear credentials
      updates.username = undefined;
      updates.password = undefined;
      updates.canLogin = false;
    }
  } else {
    // 🚫 If canLogin not modified → don’t touch username/password
    delete updates.username;
    delete updates.password;
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
    new apiResponse(200, { id: user._id, isActive: user.isActive },
      `User ${user.isActive ? "activated" : "disabled"} successfully`)
  );
});

/* ============================================================
   ❌ SOFT DELETE USER
============================================================ */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleter = req.user?._id || null;

  const user = await User.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!user) throw new apiError(404, "User not found");

  user.isDeleted = true;
  user.deletedAt = new Date();
  user.deletedBy = deleter;
  await user.save();

  await UserLogin.deleteOne({ user: user._id }); // also remove login credentials

  return res.status(200).json(new apiResponse(200, { id: user._id }, "User soft-deleted successfully"));
});

export {
  registerUser,
  getAllUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
};
