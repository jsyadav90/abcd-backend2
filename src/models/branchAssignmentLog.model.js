import mongoose from "mongoose";

const branchAssignmentLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
    action: { type: String, enum: ["assign", "remove"], required: true },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    note: { type: String }, // optional (e.g., reason)
  },
  { timestamps: true }
);

export const BranchAssignmentLog = mongoose.model(
  "BranchAssignmentLog",
  branchAssignmentLogSchema
);
