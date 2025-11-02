import express from "express";
import {
  loginUser,
  logoutUser,
  refreshAccessToken,
  reAuthenticateUser,
  logoutFromAllDevices,
  logoutSelectedUsers,
  logoutAllBelowUsers,
} from "../controllers/auth.controllers.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = express.Router();

router.route("/login").post(upload.none(), loginUser);
router.route("/logout").post(logoutUser);
router.route("/logoutfromall").post(logoutFromAllDevices);
router.route("/logout-multiple").post(logoutSelectedUsers);
router.route("/logout-all").post(logoutAllBelowUsers);
router.route("/refresh-token").post(refreshAccessToken);
router.route("/re-authenticate").post(reAuthenticateUser);

export default router;
