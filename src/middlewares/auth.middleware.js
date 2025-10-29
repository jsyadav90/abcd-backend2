import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";

/**
 * ✅ Universal JWT Auth Middleware
 * Supports both cookies and Authorization headers
 */
const authenticateJWT = async (req, res, next) => {
  try {
    let token;

    // ✅ 1️⃣ Try from "Authorization" header
    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // ✅ 2️⃣ Else try from secure cookies (frontend)
    else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    // ✅ 3️⃣ If still no token → unauthorized
    if (!token) {
      return res.status(401).json({ message: "Access token missing" });
    }

    // ✅ 4️⃣ Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.ACCESS_TOKEN_KEY);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired access token" });
    }

    // ✅ 5️⃣ Fetch user (populate role & branch safely)
    const user = await User.findById(decoded.id)
      .populate("role", "roleName permissions")
      .populate("branch", "branchName code location");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "User account inactive" });
    }

    // ✅ 6️⃣ Attach user to request for later use
    req.user = user;

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(500).json({ message: "Authentication failed", error: error.message });
  }
};

export { authenticateJWT };
