// controllers/user.controller.js
// import bcrypt from "bcrypt";
import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { User } from "../models/user.model.js";
import { UserLogin } from "../models/userLogin.model.js";
import { UserRole } from "../models/userRole.model.js"; // ✅ Ensure this import

/* ============================================================
   🟢 REGISTER USER (Full permission + branch logic)
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
    branch,
    department,
    designation,
    isActive,
    remarks,
  } = req.body;

  const loginAllowed = canLogin === true || canLogin === "true";
  const loggedInUser = req.user;

  if (!loggedInUser) throw new apiError(401, "Login required to register a user");
  if (!userId?.trim()) throw new apiError(400, "User ID is required");
  if (!fullName?.trim()) throw new apiError(400, "Full Name is required");

  // ============================================================
  // 🔹 Fetch logged-in user with role & branches
  // ============================================================
  const currentUser = await User.findById(loggedInUser._id)
    .populate({
      path: "role",
      select: "roleName permissions",
    })
    .populate("assignedBranches", "name")
    .populate("branch", "name");

  if (!currentUser) throw new apiError(401, "Invalid logged-in user");

  // ============================================================
  // 🔹 Permission Check
  // ============================================================
  const hasCreatePermission = currentUser.role?.permissions?.some(
    (perm) =>
      perm.action === "create_user" &&
      (perm.granted === true || perm.granted === "true")
  );

  if (!hasCreatePermission) {
    throw new apiError(403, "You do not have rights to create a user");
  }

  // ============================================================
  // 🔹 Branch Handling & Validation
  // ============================================================
  let finalBranch;

  if (currentUser.assignedBranches?.length === 1) {
    finalBranch = currentUser.assignedBranches[0]._id;
  } else if (currentUser.assignedBranches?.length > 1) {
    if (!branch) throw new apiError(400, "Branch is required (multiple branches assigned)");
    finalBranch = branch;
  } else if (currentUser.branch?._id) {
    finalBranch = currentUser.branch._id;
  } else {
    throw new apiError(400, "No branch found for logged-in user");
  }

  // ✅ Check if creator has permission to assign this branch
  const assignedBranchIds = currentUser.assignedBranches.map((b) => b._id.toString());
  const canAssignThisBranch =
    assignedBranchIds.includes(finalBranch.toString()) ||
    currentUser.branch?._id?.toString() === finalBranch.toString();

  if (!canAssignThisBranch) {
    throw new apiError(
      403,
      "You cannot assign a user to this branch because it is not assigned to you"
    );
  }

  // ============================================================
  // 🔹 Default Role Assignment ('user')
  // ============================================================
  const userRole = await UserRole.findOne({ roleName: "user" });
  if (!userRole) throw new apiError(500, "Default 'user' role not found");

  const finalRole = userRole._id;
  const finalRoleName = userRole.roleName?.toLowerCase();

  // ============================================================
  // 🔹 Duplicate checks
  // ============================================================
  if (email && (await User.findOne({ email, isDeleted: { $ne: true } })))
    throw new apiError(409, "Email already exists");
  if (phoneNo && (await User.findOne({ phoneNo, isDeleted: { $ne: true } })))
    throw new apiError(409, "Phone number already exists");

  // ============================================================
  // 🔹 Create User Record
  // ============================================================
  const assignedBranches = [finalBranch]; // Auto add the main branch
  const newUser = await User.create({
    userId,
    fullName,
    username: username?.toLowerCase(),
    role: finalRole,
    branch: finalBranch,
    canLogin: loginAllowed,
    email,
    phoneNo,
    department,
    designation,
    isActive,
    remarks,
    createdBy: currentUser._id,
    assignedBranches:[finalBranch],
  });

  // ============================================================
  // 🔹 Login Record Creation Logic
  // ============================================================
  if (loginAllowed && finalRoleName !== "user") {
    if (!username?.trim()) throw new apiError(400, "Username is required for login-enabled users");
    if (!password?.trim()) throw new apiError(400, "Password is required for login-enabled users");

    const existingLogin = await UserLogin.findOne({
      username: username.toLowerCase(),
    });
    if (existingLogin) throw new apiError(409, "Username already exists");

    await UserLogin.create({
      user: newUser._id,
      username: username.toLowerCase(),
      password,
    });
  }

  // ============================================================
  // 🔹 Response
  // ============================================================
  const createdUser = await User.findById(newUser._id)
    .populate("role", "roleName")
    .populate("branch", "name")
    .populate("assignedBranches", "name");

  return res
    .status(201)
    .json(new apiResponse(201, createdUser, "User registered successfully"));
});




/* ============================================================
   🔍 GET ALL USERS (with branch access restriction + filters)
============================================================ */
export const getAllUsers = asyncHandler(async (req, res) => {
  const loggedInUser = req.user;
  if (!loggedInUser) throw new apiError(401, "Login required");

  // ============================================================
  // 🔹 Fetch logged-in user's branch access
  // ============================================================
  const currentUser = await User.findById(loggedInUser._id)
    .populate("assignedBranches", "name")
    .populate("branch", "name");

  if (!currentUser) throw new apiError(401, "Invalid logged-in user");

  const { isActive, isDisabled, role, branch, search, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // ============================================================
  // 🔹 Build Filter
  // ============================================================
  const filter = { isDeleted: { $ne: true } };

  // 1️⃣ Active/Inactive
  if (isActive !== undefined) filter.isActive = isActive === "true";

  // 2️⃣ Disabled/Enabled (if exists in schema)
  if (isDisabled !== undefined) filter.isDisabled = isDisabled === "true";

  // 3️⃣ Role filter
  if (role) filter.role = role;

  // 4️⃣ Branch Filter — only branches assigned to logged-in user
  if (branch) {
    const hasAccess = currentUser.assignedBranches.some(
      (b) => b._id.toString() === branch
    );
    if (!hasAccess)
      throw new apiError(403, "You are not assigned to this branch");
    filter.branch = branch;
  } else {
    const assignedIds = currentUser.assignedBranches.map((b) => b._id);
    if (assignedIds.length > 0) {
      filter.branch = { $in: assignedIds };
    } else if (currentUser.branch?._id) {
      filter.branch = currentUser.branch._id;
    } else {
      throw new apiError(400, "No accessible branch found for logged-in user");
    }
  }

  // 5️⃣ Search filter
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
      { phoneNo: { $regex: search, $options: "i" } },
    ];
  }

  // ============================================================
  // 🔹 Query DB with Pagination
  // ============================================================
  const [users, total] = await Promise.all([
    User.find(filter)
      .populate("role", "roleName")
      .populate("branch", "name")
      .populate("assignedBranches", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  // ============================================================
  // 🔹 Response
  // ============================================================
  return res.status(200).json(
    new apiResponse(
      200,
      {
        users,
        total,
        page: Number(page),
        limit: Number(limit),
        assignedBranches: currentUser.assignedBranches,
      },
      "Users fetched successfully"
    )
  );
});


/* ============================================================
   👁️ GET SINGLE USER (secure - branch + reporting check)
============================================================ */
export const getUserById = asyncHandler(async (req, res) => {
  const loggedInUser = req.user;
  if (!loggedInUser) throw new apiError(401, "Login required");

  const { id } = req.params;

  // ============================================================
  // 🔹 Fetch logged-in user with role + branch info
  // ============================================================
  const currentUser = await User.findById(loggedInUser._id)
    .populate("assignedBranches", "name")
    .populate("branch", "name");

  if (!currentUser) throw new apiError(401, "Invalid logged-in user");

  // ============================================================
  // 🔹 Fetch target user
  // ============================================================
  const targetUser = await User.findOne({ _id: id, isDeleted: { $ne: true } })
    .populate("role", "roleName permissions")
    .populate("branch", "name")
    .populate("reportingTo", "fullName role branch");

  if (!targetUser) throw new apiError(404, "User not found");

  // ============================================================
  // 🔹 Access Control Check
  // ============================================================

  // 1️⃣ Get all branch IDs accessible by logged-in user
  const assignedBranchIds = currentUser.assignedBranches.map((b) => b._id.toString());
  const userBranchId = targetUser.branch?._id?.toString();

  // 2️⃣ Determine access
  const hasBranchAccess =
    assignedBranchIds.includes(userBranchId) ||
    currentUser.branch?._id?.toString() === userBranchId;

  const isReportingToUser =
    targetUser.reportingTo?.toString() === currentUser._id.toString();

  // 3️⃣ Admin override (optional)
  const isAdmin = currentUser.role?.roleName?.toLowerCase() === "administrator";

  // 4️⃣ Final check
  if (!isAdmin && !hasBranchAccess && !isReportingToUser) {
    throw new apiError(
      403,
      "You do not have permission to view this user's details"
    );
  }

  // ============================================================
  // 🔹 Success Response
  // ============================================================
  return res
    .status(200)
    .json(new apiResponse(200, targetUser, "User fetched successfully"));
});


/* ============================================================
   ✏️ UPDATE USER (secure - branch + reporting check + login sync)
============================================================ */
export const updateUser = asyncHandler(async (req, res) => {
  const loggedInUser = req.user;
  if (!loggedInUser) throw new apiError(401, "Login required");

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

  // ============================================================
  // 🔹 Fetch logged-in user info
  // ============================================================
  const currentUser = await User.findById(loggedInUser._id)
    .populate("assignedBranches", "name")
    .populate("branch", "name")
    .populate("role", "roleName");

  if (!currentUser) throw new apiError(401, "Invalid logged-in user");

  // ============================================================
  // 🔹 Fetch target user
  // ============================================================
  const user = await User.findOne({ _id: id, isDeleted: { $ne: true } })
    .populate("branch", "name")
    .populate("reportingTo", "fullName role");

  if (!user) throw new apiError(404, "User not found");

  // ============================================================
  // 🔹 Permission Check (Branch + Reporting)
  // ============================================================
  const assignedBranchIds = currentUser.assignedBranches.map((b) => b._id.toString());
  const targetBranchId = user.branch?._id?.toString();

  const hasBranchAccess =
    assignedBranchIds.includes(targetBranchId) ||
    currentUser.branch?._id?.toString() === targetBranchId;

  const isReportingToUser =
    user.reportingTo?._id?.toString() === currentUser._id.toString();

  const isAdmin =
    currentUser.role?.roleName?.toLowerCase() === "administrator";

  if (!isAdmin && !hasBranchAccess && !isReportingToUser) {
    throw new apiError(
      403,
      "You do not have permission to update this user's details"
    );
  }

  // ============================================================
  // 🔹 Update Base Info
  // ============================================================
  if (fullName) user.fullName = fullName;
  if (email) user.email = email;
  if (phoneNo) user.phoneNo = phoneNo;
  if (department) user.department = department;
  if (designation) user.designation = designation;
  if (branch) {
    // ensure branch is valid and within allowed branches
    const hasAccessToNewBranch =
      assignedBranchIds.includes(branch.toString()) ||
      isAdmin;
    if (!hasAccessToNewBranch)
      throw new apiError(403, "You cannot assign user to this branch");

    user.branch = branch;

    // auto-add new branch into assignedBranches if not already present
    if (!user.assignedBranches?.includes(branch)) {
      user.assignedBranches = user.assignedBranches || [];
      user.assignedBranches.push(branch);
    }
  }
  if (remarks) user.remarks = remarks;
  if (role) user.role = role;

  // ============================================================
  // 🔹 Handle Login Logic
  // ============================================================
  const loginDoc = await UserLogin.findOne({ user: user._id });

  if (canLogin === true || canLogin === "true") {
    user.canLogin = true;

    if (!username)
      throw new apiError(400, "Username required for login-enabled users");
    if (!password && !loginDoc)
      throw new apiError(400, "Password required for first-time login setup");

    if (loginDoc) {
      // update existing login
      loginDoc.username = username.toLowerCase();
      if (password) loginDoc.password = password;
      await loginDoc.save();
    } else {
      // create new login
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

  // ============================================================
  // 🔹 Save and Return
  // ============================================================
  user.updatedBy = currentUser._id;
  await user.save();

  const updatedUser = await User.findById(user._id)
    .populate("role", "roleName")
    .populate("branch", "name")
    .populate("reportingTo", "fullName role");

  return res
    .status(200)
    .json(new apiResponse(200, updatedUser, "User updated successfully"));
});


/* ============================================================
   🚫 ENABLE / DISABLE USER
============================================================ */
export const toggleUserStatus = asyncHandler(async (req, res) => {
  const loggedInUser = req.user;
  if (!loggedInUser) throw new apiError(401, "Login required");

  const { id } = req.params;

  // 🔹 Fetch logged-in user with assigned branches
  const currentUser = await User.findById(loggedInUser._id)
    .populate("assignedBranches", "_id name")
    .populate("branch", "_id name");

  if (!currentUser) throw new apiError(401, "Invalid logged-in user");

  // 🔹 Fetch target user
  const targetUser = await User.findOne({ _id: id, isDeleted: { $ne: true } })
    .populate("branch", "_id name");

  if (!targetUser) throw new apiError(404, "User not found");

  // ============================================================
  // 🔍 Check branch access
  // ============================================================
  const assignedBranchIds = currentUser.assignedBranches.map((b) => b._id.toString());
  const targetBranchId = targetUser.branch?._id?.toString();

  // if branch of target user is NOT in logged-in user's assignedBranches → deny
  if (!assignedBranchIds.includes(targetBranchId)) {
    throw new apiError(
      403,
      `You do not have permission to update users from branch "${targetUser.branch?.name || "Unknown"}"`
    );
  }

  // ============================================================
  // ✅ Toggle user active status
  // ============================================================
  targetUser.isActive = !targetUser.isActive;
  targetUser.updatedBy = currentUser._id;
  await targetUser.save();

  return res.status(200).json(
    new apiResponse(
      200,
      { id: targetUser._id, isActive: targetUser.isActive },
      `User ${targetUser.isActive ? "activated" : "disabled"} successfully`
    )
  );
});


/* ============================================================
   ❌ DELETE USER (soft delete with branch validation)
============================================================ */
export const deleteUser = asyncHandler(async (req, res) => {
  const loggedInUser = req.user;
  if (!loggedInUser) throw new apiError(401, "Login required");

  const { id } = req.params;

  // 🔹 Fetch logged-in user with assigned branches
  const currentUser = await User.findById(loggedInUser._id)
    .populate("assignedBranches", "_id name")
    .populate("branch", "_id name");

  if (!currentUser) throw new apiError(401, "Invalid logged-in user");

  // 🔹 Fetch target user
  const targetUser = await User.findOne({ _id: id, isDeleted: { $ne: true } })
    .populate("branch", "_id name");

  if (!targetUser) throw new apiError(404, "User not found");

  // ============================================================
  // 🔍 Check branch access
  // ============================================================
  const assignedBranchIds = currentUser.assignedBranches.map((b) => b._id.toString());
  const targetBranchId = targetUser.branch?._id?.toString();

  // if branch of target user is NOT in logged-in user's assignedBranches → deny
  if (!assignedBranchIds.includes(targetBranchId)) {
    throw new apiError(
      403,
      `You do not have permission to delete users from branch "${targetUser.branch?.name || "Unknown"}"`
    );
  }

  // ============================================================
  // 🧹 Soft Delete User
  // ============================================================
  targetUser.isDeleted = true;
  targetUser.deletedAt = new Date();
  targetUser.deletedBy = currentUser._id;
  await targetUser.save();

  // 🗑️ Remove associated login record
  await UserLogin.deleteOne({ user: targetUser._id });

  return res.status(200).json(
    new apiResponse(200, { id: targetUser._id }, "User soft-deleted successfully")
  );
});


/* ============================================================
   ♻️ RESTORE USER (undo soft-delete)
============================================================ */
export const restoreUser = asyncHandler(async (req, res) => {
  const loggedInUser = req.user;
  if (!loggedInUser) throw new apiError(401, "Login required");

  const { id } = req.params;

  // 🔹 Fetch logged-in user with assigned branches
  const currentUser = await User.findById(loggedInUser._id)
    .populate("assignedBranches", "_id name")
    .populate("branch", "_id name");

  if (!currentUser) throw new apiError(401, "Invalid logged-in user");

  // 🔹 Find target (deleted) user
  const targetUser = await User.findOne({ _id: id, isDeleted: true })
    .populate("branch", "_id name");

  if (!targetUser) throw new apiError(404, "Deleted user not found");

  // ============================================================
  // 🔍 Check branch access
  // ============================================================
  const assignedBranchIds = currentUser.assignedBranches.map((b) => b._id.toString());
  const targetBranchId = targetUser.branch?._id?.toString();

  if (!assignedBranchIds.includes(targetBranchId)) {
    throw new apiError(
      403,
      `You do not have permission to restore users from branch "${targetUser.branch?.name || "Unknown"}"`
    );
  }

  // ============================================================
  // ✅ Restore User
  // ============================================================
  targetUser.isDeleted = false;
  targetUser.deletedAt = null;
  targetUser.deletedBy = null;
  await targetUser.save();

  return res
    .status(200)
    .json(new apiResponse(200, targetUser, "User restored successfully"));
});



/* ============================================================
   🔍 GET USERS BY BRANCH (Only allowed branches)
============================================================ */
export const getUsersByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const loggedInUser = req.user;

  // ✅ Check login
  if (!loggedInUser) throw new apiError(401, "Login required");

  // ✅ Fetch current user with assigned branches
  const currentUser = await User.findById(loggedInUser._id)
    .populate("assignedBranches", "name")
    .populate("role", "roleName");

  if (!currentUser) throw new apiError(401, "Invalid logged-in user");

  // ✅ Check if this branch is assigned to logged-in user
  const allowedBranchIds = currentUser.assignedBranches.map((b) => b._id.toString());
  if (!allowedBranchIds.includes(branchId.toString())) {
    throw new apiError(403, "You are not authorized to view users of this branch");
  }

  // ✅ Fetch all users belonging to this branch
  const users = await User.find({
    // total :users.length ,
    branch: branchId,
    isDeleted: { $ne: true },
  })
    .populate("role", "roleName")
    .populate("branch", "name")
    .sort({ fullName: 1 });

    const total = users.length

  return res.status(200).json(
    new apiResponse(200, {total, users}, "Users fetched successfully for this branch")
  );
});
