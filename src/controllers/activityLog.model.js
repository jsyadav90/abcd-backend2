import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true, // e.g. "create_role", "update_permission", "delete_branch"
    },
    description: {
      type: String,
      trim: true,
    },
    targetModel: {
      type: String,
      trim: true, // e.g. "UserRole", "Branch", "Group"
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "targetModel", // dynamically reference any model
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
