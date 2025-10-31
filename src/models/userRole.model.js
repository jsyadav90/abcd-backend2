import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true, // e.g., "create_branch", "delete_user", etc.
    },
    granted: {
      type: Boolean,
      default: true, // true => allowed, false => denied
    },
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // who updated this permission
    },
    modifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const userRoleSchema = new mongoose.Schema(
  {
    roleName: {
      type: String,
      required: true,
      trim: true,
      unique: true, // no duplicate role names
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    deactivatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },

    // ✅ Array of permission objects (dynamic add/remove with history)
    permissions: [permissionSchema],

    // ✅ Optional: who created this role
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ✅ For enterprise-level scoping (optional but useful in ERPs)
    enterprise: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enterprise",
      default: null,
    },

    // ✅ Role status
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const UserRole = mongoose.model("UserRole", userRoleSchema);
