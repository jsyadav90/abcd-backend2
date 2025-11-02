import mongoose, { Schema } from "mongoose";

const branchSchema = new Schema(
  {
    enterprise: { type: Schema.Types.ObjectId, ref: "Enterprise", required: true },
    
    branchCode: {
      type: String,
      trim: true,
      unique: true,
      required: true,
      index: true,
      lowercase: true,
    },
    branchName: {
      type: String,
      trim: true,
      unique: true,
      required: true,
      index: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phoneNo: {
      type: String,
      trim: true,
      match: [/^[0-9+\-()\s]*$/, "Invalid phone number format"],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    status: {
      type: Boolean,
      default: true, // true = active
    },
    logo: {
      type: String,
    },
    remarks: {
      type: String,
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        ret.id = ret._id;
        delete ret._id;
      },
    },
  }
);

export const Branch = mongoose.model("Branch", branchSchema);
