// models/userLogin.model.js
import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const userLoginSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    refreshToken: { type: String, select: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockLevel: { type: Number, default: 0 }, // 0-none, 1-1min, 2-3min, 3-5min, 4-permanent
    lockUntil: { type: Date, default: null },
    isPermanentlyLocked: { type: Boolean, default: false },
    isLoggedIn: { type: Boolean, default: false },
    lastLogin: { type: Date },

    // Device-level tracking
    loggedInDevices: [
      {
        deviceId: { type: String, default: () => uuidv4() },
        ipAddress: String,
        userAgent: String,
        loginCount: { type: Number, default: 0 },
        refreshToken: String,
        loginHistory: [
          {
            loginAt: { type: Date, default: Date.now },
            logoutAt: Date,
          },
        ],
      },
    ],
    maxAllowedDevices: { type: Number, default: 2 },
  },
  { timestamps: true }
);

//////////////////////////////
// Password Hash
//////////////////////////////
userLoginSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

//////////////////////////////
// Password Compare
//////////////////////////////
userLoginSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

//////////////////////////////
// Token Generators
//////////////////////////////
userLoginSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      id: this.user,
      username: this.username,
      fullName: this.fullName,
      role: this.role,
      branch: this.branch,
    },
    process.env.ACCESS_TOKEN_KEY,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

userLoginSchema.methods.generateRefreshToken = async function () {
  const token = jwt.sign({ id: this.user }, process.env.REFRESH_TOKEN_KEY, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });
  this.refreshToken = token;
  await this.save();
  return token;
};

export const UserLogin = mongoose.model("UserLogin", userLoginSchema);
