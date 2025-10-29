import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { User } from "../models/user.model.js";


const registerUser = asyncHandler(async (req, res) => {
  // ======================================
  // 🔒 1. Only logged-in users can register
  // ======================================
  // const creator = req.user; // from auth middleware
  // if (!creator) throw new apiError(401, "Unauthorized: Please login first");

  // ======================================
  // 📥 2. Extract data
  // ======================================
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
    branch, // only used by Enterprise Admin / Super Admin
  } = req.body;

  const loginAllowed = canLogin === true || canLogin === "true";

  // ======================================
  // 🧩 3. Basic Required Field Checks
  // ======================================
  if (!userId?.trim()) throw new apiError(400, "User ID is required");
  if (!fullName?.trim()) throw new apiError(400, "Full Name is required");

  if (loginAllowed) {
    if (!username?.trim()) throw new apiError(400, "Username is required when login is allowed");
    if (!password?.trim()) throw new apiError(400, "Password is required when login is allowed");
  }

  // ======================================
  // 🔍 4. Duplicate Checks
  // ======================================
  if (email && await User.findOne({ email })) throw new apiError(409, "Email already exists");
  if (phoneNo && await User.findOne({ phoneNo })) throw new apiError(409, "Phone number already exists");
  if (loginAllowed && username && await User.findOne({ username: username.toLowerCase() })) {
    throw new apiError(409, "Username already exists");
  }

  // ======================================
  // 🧠 5. Role-based Creation Rules
  // ======================================
  let assignedBranch = null;

  // switch (creator.role) {
  //   case "enterpriseAdmin":
  //     if (!["superAdmin", "admin","user"].includes(role)) {
  //       throw new apiError(403, "Enterprise Admin can only create Super Admin or Admin users");
  //     }
  //     assignedBranch = branch || creator.branch; // can choose any branch
  //     break;

  //   case "superAdmin":
  //     if (role !== "admin") {
  //       throw new apiError(403, "Super Admin can only create Admin users");
  //     }

  //     // check if given branch is allowed (must be under superAdmin)
  //     if (branch && !creator.branch.includes(branch)) {
  //       throw new apiError(403, "Super Admin can assign only their own branches");
  //     }

  //     assignedBranch = branch || creator.branch;
  //     break;

  //   case "admin":
  //     if (role !== "user") {
  //       throw new apiError(403, "Admin can only create User role");
  //     }
  //     assignedBranch = creator.branch; // auto same branch
  //     break;

  //   default:
  //     throw new apiError(403, "You are not allowed to register new users");
  // }

  // if (!assignedBranch) {
  //   throw new apiError(400, "Branch assignment failed");
  // }

  // ======================================
  // 🏗️ 6. Prepare User Data
  // ======================================
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
    // createdBy: creator._id,
  };

  if (loginAllowed) {
    userData.username = username.toLowerCase();
    userData.password = password;
  }

  // ======================================
  // 💾 7. Save User
  // ======================================
  const user = await User.create(userData);

  const createdUser = await User.findById(user._id).select("-password -refreshToken");

  if (!createdUser) {
    throw new apiError(500, "User registration failed");
  }

  // ======================================
  // ✅ 8. Response
  // ======================================
  return res.status(201).json(
    new apiResponse(201, createdUser, "User registered successfully")
  );
});

export { registerUser };
