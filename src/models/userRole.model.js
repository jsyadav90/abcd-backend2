import mongoose from "mongoose";

const userRoleSchema = new mongoose.Schema(
  {
    roleName: {
      type: String,
      required: true,
      trim: true,
      unique: true, // no duplicate role names
    },
    permissions: [
      {
        type: String,
      },
    ],
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const UserRole = mongoose.model("UserRole", userRoleSchema);
