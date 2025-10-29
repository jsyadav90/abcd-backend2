import express from "express";
import { upload } from "../middlewares/multer.middleware.js";
import {
  createBranch,
  getAllBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  toggleBranchStatus,
} from "../controllers/branch.controllers.js";
import { authenticateJWT } from "../middlewares/auth.middleware.js";
// import { isEnterpriseAdmin } from "../middlewares/enterpriseAdmin.middleware.js";

const router = express.Router();

// ✅ Create a new branch (requires login + admin)
router
  .route("/create")
  .post(upload.none(),createBranch);

// ✅ View all branches (public)
router.route("/allbranches").get(getAllBranches);

// ✅ Get, Update, Delete single branch
router
  .route("/:id")
  .get(getBranchById)
  .put(authenticateJWT, updateBranch)
  .delete(authenticateJWT, deleteBranch);

// ✅ Toggle branch status (admin only)
router
  .route("/:id/toggle-status")
  .patch(authenticateJWT,  toggleBranchStatus);

export default router;
