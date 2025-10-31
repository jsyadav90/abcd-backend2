import express from "express";
import {
  createUserRole,
  getAllUserRoles,
  getUserRoleById,
  updateUserRole,
  updateRolePermissions, // ✅ Corrected name
  deleteUserRole,
  getAllPermissions,
  removeRolePermissions,
} from "../controllers/userRole.controllers.js";

import { upload } from "../middlewares/multer.middleware.js";
import { authorizePermission } from "../middlewares/authorizePermission.js";

const router = express.Router();

// ⚙️ Get all available permissions (it's always come first )
router.route("/permissions").get(getAllPermissions);
  
// 🟢 Create new role
router.route("/create").post(upload.none(), createUserRole);

// 🟡 Get all roles
router.route("/").get(upload.none(), getAllUserRoles);

// 🟣 Get single role by ID
router.route("/:id").get(upload.none(), getUserRoleById);

// 🟠 Update role (name/description/status)
router.route("/:id").put(upload.none(), updateUserRole);

// 🔴 Delete role
router.route("/:id").delete(upload.none(), deleteUserRole);

// 🔵 Update role permissions
router.route("/:id/permissions").put(upload.none(), updateRolePermissions); // ✅ fixed

// Remove role permissions
router.put("/:id/permissions/remove", upload.none(), removeRolePermissions);

export default router;
