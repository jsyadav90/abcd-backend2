import express from "express";
import {
  createGroup,
  getAllGroups,
  updateGroup,
  deleteGroup,
} from "../controllers/group.controllers.js";
import { authenticateJWT } from "../middlewares/auth.middleware.js";

const router = express.Router();

router
  .route("/create")
  .post(authenticateJWT, createGroup);

router
  .route("/")
  .get(authenticateJWT, getAllGroups);

router
  .route("/:id")
  .put(authenticateJWT, updateGroup)
  .delete(authenticateJWT, deleteGroup);

export default router;
