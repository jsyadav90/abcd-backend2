import { User } from "../models/user.model.js";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

export const loginUser = async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password required" });

    const user = await User.findOne({ username: username.toLowerCase() })
  .populate("role", "roleName") // only roleName field
  .populate("branch", "branchName") // only branchName field
  .select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isActive) return res.status(403).json({ message: "User account inactive" });
    if (!user.canLogin) return res.status(403).json({ message: "User cannot log in" });

    // Lockout check
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(403).json({ message: "Account locked due to failed login attempts. Try later." });
    }

    //! password match 
   const isMatch = await user.comparePassword(password);
if (!isMatch) {
  user.failedLoginAttempts += 1;
  if (user.failedLoginAttempts >= 5) {
    user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
  await user.save();
  return res.status(401).json({ message: "Invalid credentials too" });
}

    //! Reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockUntil = null;

    const currentDeviceId = deviceId || "manual-" + uuidv4();
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"] || "unknown";

    let device = user.loggedInDevices.find(
      (d) => d.deviceId === currentDeviceId || (d.ipAddress === ipAddress && d.userAgent === userAgent)
    );

    if (device) {
      const lastSession = device.loginHistory[device.loginHistory.length - 1];
      if (lastSession && !lastSession.logoutAt) {
        // Already logged in → reuse refresh token
        return res.status(200).json({
          success: true,
          message: "Already logged in on this device",
          deviceId: device.deviceId,
        });
      }
      // New session on same device
      device.loginHistory.push({ loginAt: new Date() });
      device.loginCount += 1;
    } else {
      // New device check
      if (user.loggedInDevices.length >= user.maxAllowedDevices) {
        return res.status(403).json({
          message: `Maximum devices reached (${user.maxAllowedDevices}). Logout another device first.`,
        });
      }
      device = {
        deviceId: currentDeviceId,
        ipAddress,
        userAgent,
        loginHistory: [{ loginAt: new Date() }],
        loginCount: 1,
        refreshToken: null,
      };
      user.loggedInDevices.push(device);
    }

    user.isLoggedIn = true;
    user.lastLogin = new Date();

    // Generate tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = jwt.sign({ id: user._id, deviceId: device.deviceId }, process.env.REFRESH_TOKEN_KEY, {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    });
    device.refreshToken = refreshToken;

    await user.save();

    // Set secure HttpOnly cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 1000 * 60 * 15, // 15 minutes
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      deviceId: device.deviceId,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        role: user.role.roleName,
        branch: user.branch,
        department: user.department,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


// Logout 

export const logoutUser = async (req, res) => {
  try {
    const { userId, deviceId } = req.body;

    if (!userId || !deviceId)
      return res.status(400).json({ message: "userId and deviceId required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const device = user.loggedInDevices.find((d) => d.deviceId === deviceId);
    if (!device)
      return res.status(404).json({ message: "Device not found" });

    // ✅ Mark last session logout
    if (device.loginHistory?.length) {
      const last = device.loginHistory[device.loginHistory.length - 1];
      if (!last.logoutAt) last.logoutAt = new Date();
    }

    device.refreshToken = null;

    // ✅ Check if any active session left
    const hasActive = user.loggedInDevices.some((d) =>
      d.loginHistory?.some((s) => !s.logoutAt)
    );
    user.isLoggedIn = hasActive;

    await user.save({ validateBeforeSave: false });

    // ✅ Clear cookies properly
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.status(200).json({ success: true, message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


