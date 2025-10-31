import { User } from "../models/user.model.js";
import { UserRole } from "../models/userRole.model.js";

const authorizePermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?._id; // assuming user added by authenticateJWT
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await User.findById(userId).populate("role");
      if (!user || !user.role) {
        return res.status(403).json({ message: "No role assigned" });
      }

      const role = await UserRole.findById(user.role._id);
      if (!role) {
        return res.status(403).json({ message: "Role not found" });
      }

      if (!role.permissions.includes(requiredPermission)) {
        return res.status(403).json({ message: "Permission denied" });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
};


export {authorizePermission}