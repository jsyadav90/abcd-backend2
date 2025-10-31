import express from "express";
import {
  createUserRole,
  getAllUserRoles,
  getUserRoleById,
  updateUserRole,
  updateRolePermissions,
  removeRolePermissions,
  getAllPermissions,
  deleteUserRole,
} from "../controllers/userRole.controllers.js"; // ✅ make sure filename matches exactly

import { upload } from "../middlewares/multer.middleware.js";
import { authenticateJWT } from "../middlewares/auth.middleware.js";
import { authorizePermission } from "../middlewares/authorizePermission.js"; // ✅ your custom permission-based middleware

const router = express.Router();

/* ============================================================
   ⚙️ Get all available permissions
   (Usually needed by frontend dropdowns)
============================================================ */
router.route("/permissions").get(
  // authenticateJWT, 
  getAllPermissions);

/* ============================================================
   🟢 Create new user role
============================================================ */
router
  .route("/create")
  .post(
    // authenticateJWT,
    // authorizePermission("create_role"), // optional fine-grained permission
    upload.none(),
    createUserRole
  );

/* ============================================================
   🟡 Get all user roles
============================================================ */
router
  .route("/")
  .get(
    // authenticateJWT, authorizePermission("view_roles"), 
    upload.none(), getAllUserRoles);

/* ============================================================
   🟣 Get single role by ID
============================================================ */
router
  .route("/:id")
  .get(
    // authenticateJWT, authorizePermission("view_roles"), 
    upload.none(), getUserRoleById);

/* ============================================================
   🟠 Update role (name, description, status)
============================================================ */
router
  .route("/:id")
  .put(
    // authenticateJWT, authorizePermission("update_role"), 
    upload.none(), updateUserRole);

/* ============================================================
   🔵 Update role permissions (add/update)
============================================================ */
router
  .route("/:id/permissions")
  .put(
    // authenticateJWT,
    // authorizePermission("update_permissions"),
    upload.none(),
    updateRolePermissions
  );

/* ============================================================
   🟣 Remove a specific permission from a role
============================================================ */
router
  .route("/:id/permissions/remove")
  .put(
    // authenticateJWT,
    // authorizePermission("remove_permissions"),
    upload.none(),
    removeRolePermissions
  );

/* ============================================================
   🔴 Delete (soft delete) user role
============================================================ */
router
  .route("/:id")
  .delete(
    // authenticateJWT,
    // authorizePermission("delete_role"),
    upload.none(),
    deleteUserRole
  );

export default router;
