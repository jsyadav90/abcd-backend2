import express from "express";
import { loginUser, logoutUser } from "../controllers/auth.controllers.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = express.Router();

router.route("/login").post(upload.none(), loginUser);
router.route("/logout").post(logoutUser);

export default router;
