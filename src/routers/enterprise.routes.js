import express from "express";
import {
  createEnterprise,
  getAllEnterprises,
  updateEnterprise,
  deleteEnterprise,
} from "../controllers/enterprise.controllers.js";
import { authenticateJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = express.Router();

router
  .route("/create")
  .post(
    upload.none(),
    // authenticateJWT, 
    createEnterprise);

router
  .route("/")
  .get(authenticateJWT, getAllEnterprises);

router
  .route("/:id")
  .put(authenticateJWT, updateEnterprise)
  .delete(authenticateJWT, deleteEnterprise);

export default router;
