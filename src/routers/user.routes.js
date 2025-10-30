import express, {Router} from "express";
import {authenticateJWT} from "../middlewares/auth.middleware.js"
import { registerUser,
  getAllUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  getUsersByBranch, } from "../controllers/user.controllers.js";
import {upload} from "../middlewares/multer.middleware.js"

const router = Router();

// Only logged-in admins or super admins can create users
router.route("/register").post(upload.none(), registerUser)
router.route("/").get(upload.none(), getAllUsers)
router.route("/:id").get(upload.none(), getUserById)
router.route("/:id").put(upload.none(), updateUser)
router.route("/:id/status").patch(upload.none(), toggleUserStatus)
router.route("/:id").delete(upload.none(), deleteUser)
router.route("/branch/:branchId").get(upload.none(), getUsersByBranch)

export default router;
