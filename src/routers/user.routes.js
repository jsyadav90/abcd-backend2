import express, {Router} from "express";
import {authenticateJWT} from "../middlewares/auth.middleware.js"
import { registerUser,
  getAllUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  restoreUser,
  getUsersByBranch,
  
 } from "../controllers/user.controllers.js";
import {
  assignBranchesToUser,
  removeAssignedBranchesFromUser,
} from "../controllers/assignBranch.controller.js";
import {
  assignReportingAuthority,
  getReportingChainUp,
  getSubordinates,
  removeReportingAuthority,
  getUserHierarchy,
} from "../controllers/reporting.controller.js";
import { changeUserRole } from "../controllers/user.controllers.js";
 import { assignReportingTo } from "../controllers/assignReporting.controller.js";
import {upload} from "../middlewares/multer.middleware.js"

const router = Router();

// specific route first
router.route("/change-role").put(upload.none(), authenticateJWT, changeUserRole)

// Only logged-in admins or super admins can create users
router.route("/register").post(upload.none(),authenticateJWT, registerUser)
router.route("/").get(upload.none(),authenticateJWT, getAllUsers)
router.route("/:id").get(upload.none(), authenticateJWT, getUserById)
router.route("/:id").put(upload.none(), authenticateJWT, updateUser)
router.route("/:id/status").patch(upload.none(),authenticateJWT, toggleUserStatus)
router.route("/:id").delete(upload.none(),authenticateJWT, deleteUser)
router.route("/:id").post(upload.none(),authenticateJWT, restoreUser)
router.route("/assign-branch").post(upload.none(),assignBranchesToUser)
router.route("/remove-branch").post(upload.none(),removeAssignedBranchesFromUser)
router.route("/assign-reporting").post(assignReportingTo)
router.route("/branch/:branchId").get(upload.none(),authenticateJWT, getUsersByBranch)

// require auth; optionally add role/permission middleware
router.route("/:id/reporting").post( upload.none(), authenticateJWT, assignReportingAuthority);
router.route("/:id/reporting/up").get( authenticateJWT, getReportingChainUp);
router.route("/:id/subordinates").get( upload.none(), authenticateJWT, getSubordinates);
router.route("/reporting/:id").delete( upload.none(), authenticateJWT, removeReportingAuthority);
router.route("/hierarchy/:id").get( upload.none(), authenticateJWT, getUserHierarchy);

export default router;
