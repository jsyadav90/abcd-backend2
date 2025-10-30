
/* ============================================================
   🔐 LOGIN USER
============================================================ */
import { User } from "../models/user.model.js";
import { UserLogin } from "../models/userLogin.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

export const loginUser = async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: "Username and password required" });

    // 🔐 Find login credentials first
    const login = await UserLogin.findOne({ username: username.toLowerCase() })
      .select("+password")
      .populate("user");

    if (!login)
      return res.status(404).json({ message: "User not found" });

    const user = login.user;
    if (!user) return res.status(404).json({ message: "User details not found" });
    if (!user.isActive) return res.status(403).json({ message: "User account inactive" });
    if (!user.canLogin) return res.status(403).json({ message: "User cannot log in" });

    // 🚫 Permanent lock check
    if (login.isPermanentlyLocked) {
      return res.status(403).json({
        message:
          "Account permanently locked. Please contact Administrator or Enterprise Admin.",
      });
    }

    // 🚫 Temporary lock check
    if (login.lockUntil && login.lockUntil > new Date()) {
      const remainingSec = Math.ceil((login.lockUntil - new Date()) / 1000);
      const remainingMin = Math.ceil(remainingSec / 60);
      return res.status(403).json({
        message: `Account temporarily locked. Try again in ${remainingMin} minute(s).`,
      });
    }

    // ✅ Password match check
    const isMatch = await bcrypt.compare(password, login.password);
    if (!isMatch) {
      login.failedLoginAttempts = (login.failedLoginAttempts || 0) + 1;

      // ⚙️ Lock system: every 3 wrong attempts → escalate lock
      const attemptsLeft = 3 - login.failedLoginAttempts;

      if (login.failedLoginAttempts >= 3) {
        login.lockLevel += 1;
        login.failedLoginAttempts = 0; // reset after lock trigger
        let lockDuration = 0;
        let lockMsg = "";

        switch (login.lockLevel) {
          case 1:
            lockDuration = 1;
            lockMsg = "Account locked for 1 minute due to multiple failed attempts.";
            break;
          case 2:
            lockDuration = 3;
            lockMsg = "Account locked for 3 minutes due to multiple failed attempts.";
            break;
          case 3:
            lockDuration = 5;
            lockMsg = "Account locked for 5 minutes due to multiple failed attempts.";
            break;
          case 4:
          default:
            login.isPermanentlyLocked = true;
            lockMsg =
              "Account permanently locked. Please contact Administrator or Enterprise Admin.";
            break;
        }

        if (!login.isPermanentlyLocked)
          login.lockUntil = new Date(Date.now() + lockDuration * 60 * 1000);

        await login.save();
        return res.status(403).json({ message: lockMsg });
      }

      await login.save();
      return res.status(401).json({
        message: `Invalid credentials. You have ${attemptsLeft} attempt(s) left before lock.`,
      });
    }

    // ✅ Successful login: reset all lock info
    login.failedLoginAttempts = 0;
    login.lockLevel = 0;
    login.lockUntil = null;
    login.isPermanentlyLocked = false;

    // 🔐 Device handling
    const currentDeviceId = deviceId || "manual-" + uuidv4();
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"] || "unknown";

    let device = login.loggedInDevices.find(
      (d) =>
        d.deviceId === currentDeviceId ||
        (d.ipAddress === ipAddress && d.userAgent === userAgent)
    );

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
      if (login.loggedInDevices.length >= login.maxAllowedDevices) {
        return res.status(403).json({
          message: `Maximum devices reached (${login.maxAllowedDevices}). Logout another device first.`,
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
      login.loggedInDevices.push(device);
    }

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
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { id: user._id, deviceId: device.deviceId },
      process.env.REFRESH_TOKEN_KEY,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
    );

    device.refreshToken = refreshToken;
    await login.save();
    await user.save();

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 1000 * 60 * 15,
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      deviceId: device.deviceId,
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
   🚪 LOGOUT USER
============================================================ */
export const logoutUser = async (req, res) => {
  try {
    const { userId, username, deviceId } = req.body;
    if ((!userId && !username) || !deviceId)
      return res.status(400).json({ message: "userId/username and deviceId required" });

    const login = await UserLogin.findOne(
      userId ? { user: userId } : { username: username.toLowerCase() }
    );

    if (!login)
      return res.status(404).json({ message: "User login record not found" });

    const device = login.loggedInDevices.find((d) => d.deviceId === deviceId);
    if (!device)
      return res.status(404).json({ message: "Device not found" });

    if (device.loginHistory?.length) {
      const last = device.loginHistory[device.loginHistory.length - 1];
      if (!last.logoutAt) last.logoutAt = new Date();
    }

    device.refreshToken = null;

    const hasActive = login.loggedInDevices.some((d) =>
      d.loginHistory?.some((s) => !s.logoutAt)
    );
    login.isLoggedIn = hasActive;

    await login.save({ validateBeforeSave: false });

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.status(200).json({ success: true, message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
