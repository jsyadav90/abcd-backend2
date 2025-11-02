// models/user.model.js
import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    phoneNo: {
      type: String,
      trim: true,
      match: [/^[0-9+\-()\s]*$/, "Invalid phone number format"],
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserRole",
      required: true,
      // default: "user",
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    assignedBranches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
      },
    ],
    reportingTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // optional if top-level (like Enterprise Admin)
    },
    department: {
      type: String,
      enum: ["admin", "teaching", "non-teaching", "school-office", "other"],
      trim: true,
      lowercase: true,
    },
    designation: {
      type: String,
      trim: true,
      lowercase: true,
    },
    canLogin: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    remarks: {
      type: String,
      trim: true,
      lowercase: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// at bottom, after userSchema definition (but before export)
userSchema.virtual("branchAssignmentLogs", {
  ref: "BranchAssignmentLog",
  localField: "_id",
  foreignField: "user",
  options: { sort: { createdAt: -1 } }, // newest first
});

// ensure virtuals are included when converting to JSON if you want them by default
userSchema.set("toObject", { virtuals: true });
userSchema.set("toJSON", { virtuals: true });


export const User = mongoose.model("User", userSchema);
