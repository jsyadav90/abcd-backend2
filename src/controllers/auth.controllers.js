import { User } from "../models/user.model.js";
import { UserLogin } from "../models/userLogin.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

/* ============================================================
   🔐 1️⃣ LOGIN USER
============================================================ */
export const loginUser = async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: "Username and password required" });

    // 🔍 Find user login record
    const login = await UserLogin.findOne({ username: username.toLowerCase() })
      .select("+password")
      .populate("user");

    if (!login) return res.status(404).json({ message: "User not found" });

    const user = login.user;
    if (!user) return res.status(404).json({ message: "User details not found" });
    if (!user.isActive)
      return res.status(403).json({ message: "User account inactive" });
    if (!user.canLogin)
      return res.status(403).json({ message: "User cannot log in" });

    // 🚫 Check permanent or temporary lock
    if (login.isPermanentlyLocked) {
      return res.status(403).json({
        message:
          "Account permanently locked. Contact Administrator or Enterprise Admin.",
      });
    }

    if (login.lockUntil && login.lockUntil > new Date()) {
      const remainingMs = login.lockUntil - new Date();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return res.status(403).json({
        message: `Account temporarily locked. Try again in ${remainingMin} minute(s).`,
      });
    }

    // ✅ Verify password
    const isMatch = await bcrypt.compare(password, login.password);
    if (!isMatch) {
      login.failedLoginAttempts += 1;

      if (login.failedLoginAttempts >= 3) {
        login.lockLevel += 1;
        login.failedLoginAttempts = 0;
        let lockMinutes = 0;

        switch (login.lockLevel) {
          case 1:
            lockMinutes = 1;
            break;
          case 2:
            lockMinutes = 3;
            break;
          case 3:
            lockMinutes = 5;
            break;
          default:
            login.isPermanentlyLocked = true;
            break;
        }

        if (!login.isPermanentlyLocked)
          login.lockUntil = new Date(Date.now() + lockMinutes * 60000);

        await login.save();
        return res.status(403).json({
          message: login.isPermanentlyLocked
            ? "Account permanently locked. Please contact Administrator."
            : `Account locked for ${lockMinutes} minute(s) due to multiple failed attempts.`,
        });
      }

      await login.save();
      return res.status(401).json({
        message: `Invalid credentials. ${3 - login.failedLoginAttempts} attempt(s) left.`,
      });
    }

    // ✅ Reset lock info after success
    login.failedLoginAttempts = 0;
    login.lockLevel = 0;
    login.lockUntil = null;
    login.isPermanentlyLocked = false;

    // 🖥️ Device tracking
    const currentDeviceId = deviceId || uuidv4();
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"] || "unknown";

    let device = login.loggedInDevices.find((d) => d.deviceId === currentDeviceId);

    // Try to find by IP + userAgent if ID not found
    if (!device) {
      device = login.loggedInDevices.find(
        (d) => d.ipAddress === ipAddress && d.userAgent === userAgent
      );
    }

    // 🧩 Existing device
    if (device) {
      const lastSession = device.loginHistory[device.loginHistory.length - 1];
      if (lastSession && !lastSession.logoutAt) {
        return res.status(200).json({
          success: true,
          message: "Already logged in on this device",
          deviceId: device.deviceId,
        });
      }
      device.loginHistory.push({ loginAt: new Date() });
      device.loginCount += 1;
    } else {
      // ⛔ Device limit check
      if (login.loggedInDevices.length >= login.maxAllowedDevices) {
        return res.status(403).json({
          message: `Maximum device limit (${login.maxAllowedDevices}) reached. Logout from another device first.`,
        });
      }

      device = {
        deviceId: currentDeviceId,
        ipAddress,
        userAgent,
        loginCount: 1,
        refreshToken: null,
        loginHistory: [{ loginAt: new Date() }],
      };
      login.loggedInDevices.push(device);
    }

    // ✅ Update login status
    login.isLoggedIn = true;
    user.lastLogin = new Date();

    // 🎟️ Generate tokens
    const accessToken = jwt.sign(
      {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        branch: user.branch,
      },
      process.env.ACCESS_TOKEN_KEY,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY } // e.g. 15m
    );

    const refreshToken = jwt.sign(
      { id: user._id, deviceId: device.deviceId },
      process.env.REFRESH_TOKEN_KEY,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRY } // e.g. 7d
    );

    device.refreshToken = refreshToken;

    await login.save({ validateBeforeSave: false });
    await user.save({ validateBeforeSave: false });

    // 🍪 Optional cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      deviceId: device.deviceId,
      tokens: { accessToken, refreshToken },
      user: {
        id: user._id,
        fullName: user.fullName,
        username: login.username,
        role: user.role,
        branch: user.branch,
        department: user.department,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ============================================================
   🚪 2️⃣ LOGOUT USER
============================================================ */
export const logoutUser = async (req, res) => {
  try {
    const { userId, username, deviceId } = req.body;
    if ((!userId && !username) || !deviceId)
      return res.status(400).json({
        message: "userId/username and deviceId are required",
      });

    const login = await UserLogin.findOne(
      userId ? { user: userId } : { username: username.toLowerCase() }
    );

    if (!login)
      return res.status(404).json({ message: "User login record not found" });

    const device = login.loggedInDevices.find((d) => d.deviceId === deviceId);
    if (!device)
      return res.status(404).json({ message: "Device not found" });

    // 🕒 Mark logout time for latest session
    if (device.loginHistory?.length) {
      const last = device.loginHistory[device.loginHistory.length - 1];
      if (!last.logoutAt) last.logoutAt = new Date();
    }

    // 🧹 Clear refresh token for this device
    device.refreshToken = null;

    // 🔧 Tell Mongoose we changed nested arrays
    login.markModified("loggedInDevices");

    // ✅ Clean up stale or expired sessions
    for (const d of login.loggedInDevices) {
      d.loginHistory = d.loginHistory.filter(
        (s) =>
          !s.logoutAt ||
          Date.now() - new Date(s.logoutAt).getTime() < 24 * 60 * 60 * 1000
      );
    }

    // ✅ Determine if any active session remains
    const activeSessions = login.loggedInDevices.flatMap((d) =>
      d.loginHistory.filter((s) => !s.logoutAt)
    );

    login.isLoggedIn = activeSessions.length > 0;

    await login.save({ validateBeforeSave: false });

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.status(200).json({
      success: true,
      message: "Logout successful",
      isLoggedIn: login.isLoggedIn,
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};



/* ============================================================
   ♻️ 3️⃣ REFRESH ACCESS TOKEN (silent renew)
============================================================ */
export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    const deviceId = req.body.deviceId;

    if (!refreshToken || !deviceId)
      return res.status(400).json({ message: "Refresh token and deviceId required" });

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_KEY);

    const login = await UserLogin.findOne({ user: decoded.id }).populate("user");
    if (!login) return res.status(404).json({ message: "Login record not found" });

    const device = login.loggedInDevices.find(
      (d) => d.deviceId === deviceId && d.refreshToken === refreshToken
    );

    if (!device)
      return res.status(403).json({ message: "Invalid or revoked refresh token" });

    const user = login.user;
    if (!user?.isActive) return res.status(403).json({ message: "User inactive" });

    const newAccessToken = jwt.sign(
      {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        branch: user.branch,
      },
      process.env.ACCESS_TOKEN_KEY,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Access token refreshed",
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
};

/* ============================================================
   🔒 4️⃣ RE-AUTHENTICATE USER (after inactivity)
============================================================ */
export const reAuthenticateUser = async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password)
      return res.status(400).json({ message: "userId and password required" });

    const login = await UserLogin.findOne({ user: userId })
      .select("+password")
      .populate("user");

    if (!login) return res.status(404).json({ message: "Login record not found" });

    const isMatch = await bcrypt.compare(password, login.password);
    if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

    const user = login.user;

    const newAccessToken = jwt.sign(
      {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        branch: user.branch,
      },
      process.env.ACCESS_TOKEN_KEY,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Re-authentication successful",
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error("Re-authenticate error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


/* ============================================================
   🔒 4️⃣ LoggedOut From All Devices
============================================================ */
export const logoutFromAllDevices = async (req, res) => {
  try {
    const { userId, username } = req.body;
    if (!userId && !username)
      return res.status(400).json({
        message: "userId or username is required",
      });

    // 🔍 Find login record
    const login = await UserLogin.findOne(
      userId ? { user: userId } : { username: username.toLowerCase() }
    );

    if (!login)
      return res.status(404).json({ message: "User login record not found" });

    // 🧹 Iterate all devices & end all sessions
    for (const device of login.loggedInDevices) {
      // Mark all open sessions as closed
      if (device.loginHistory && device.loginHistory.length) {
        device.loginHistory.forEach((session) => {
          if (!session.logoutAt) session.logoutAt = new Date();
        });
      }
      // Clear refresh token for each device
      device.refreshToken = null;
    }

    // 🚫 Reset flags
    login.isLoggedIn = false;
    login.loggedInDevices = login.loggedInDevices || [];
    login.markModified("loggedInDevices");

    await login.save({ validateBeforeSave: false });

    // 🍪 Clear cookies from current device
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.status(200).json({
      success: true,
      message: "Logged out from all devices successfully",
    });
  } catch (error) {
    console.error("Logout from all devices error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};



// 🚀 Logout selected multiple users together
export const logoutSelectedUsers = async (req, res) => {
  try {
    const { userIds } = req.body;
    const actorId = req.user.id; // from auth middleware

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "userIds array required" });
    }

    const actor = await User.findById(actorId).populate("role");
    if (!actor) return res.status(404).json({ message: "Actor user not found" });

    const actorRoleLevel = actor.role.level;

    // Fetch target users
    const targetUsers = await User.find({ _id: { $in: userIds } }).populate("role");

    // Filter users that can be logged out
    const validTargets = targetUsers.filter(
      (u) => canLogout(actorRoleLevel, u.role.level) && u._id.toString() !== actorId
    );

    if (!validTargets.length)
      return res.status(403).json({ message: "No users eligible for logout" });

    const targetIds = validTargets.map((u) => u._id);

    const logins = await UserLogin.find({ user: { $in: targetIds } });

    for (const login of logins) {
      for (const device of login.loggedInDevices) {
        if (device.loginHistory?.length) {
          device.loginHistory.forEach((s) => {
            if (!s.logoutAt) s.logoutAt = new Date();
          });
        }
        device.refreshToken = null;
      }
      login.isLoggedIn = false;
      login.markModified("loggedInDevices");
      await login.save({ validateBeforeSave: false });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully logged out ${logins.length} user(s).`,
      skipped: targetUsers.length - validTargets.length,
    });
  } catch (error) {
    console.error("logoutSelectedUsers error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// 🚨 Logout all users below in hierarchy
export const logoutAllBelowUsers = async (req, res) => {
  try {
    const actorId = req.user.id;
    const actor = await User.findById(actorId).populate("role");

    if (!actor) return res.status(404).json({ message: "Actor not found" });

    const actorLevel = actor.role.level;
    if (actorLevel > 2) // only superadmin or enterprise admin
      return res.status(403).json({ message: "Not authorized for global logout" });

    // 🔍 Fetch users below actor’s level
    const users = await User.find({
      _id: { $ne: actorId }, // exclude self
    }).populate("role");

    const targetUsers = users.filter((u) => canLogout(actorLevel, u.role.level));
    const targetIds = targetUsers.map((u) => u._id);

    const logins = await UserLogin.find({ user: { $in: targetIds } });

    for (const login of logins) {
      for (const device of login.loggedInDevices) {
        if (device.loginHistory?.length) {
          device.loginHistory.forEach((s) => {
            if (!s.logoutAt) s.logoutAt = new Date();
          });
        }
        device.refreshToken = null;
      }
      login.isLoggedIn = false;
      login.markModified("loggedInDevices");
      await login.save({ validateBeforeSave: false });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully logged out all users below your level (${targetUsers.length}).`,
    });
  } catch (error) {
    console.error("logoutAllBelowUsers error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


