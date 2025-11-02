import { User } from "../models/user.model.js";

/**
 * Assign a supervisor or admin that a user reports to
 */
export const assignReportingTo = async (req, res) => {
  try {
    const { userId, reportingToId } = req.body;

    if (!userId || !reportingToId) {
      return res.status(400).json({
        success: false,
        message: "userId and reportingToId are required.",
      });
    }

    // Prevent self-reporting
    if (userId === reportingToId) {
      return res.status(400).json({
        success: false,
        message: "A user cannot report to themselves.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const manager = await User.findById(reportingToId);
    if (!manager) {
      return res.status(404).json({
        success: false,
        message: "Reporting user not found.",
      });
    }

    // Check for circular reporting (A → B → A)
    if (String(manager.reportingTo) === userId) {
      return res.status(400).json({
        success: false,
        message: "Circular reporting detected. Operation not allowed.",
      });
    }

    user.reportingTo = reportingToId;
    await user.save();

    res.status(200).json({
      success: true,
      message: `${user.fullName} now reports to ${manager.fullName}.`,
      data: user,
    });
  } catch (error) {
    console.error("Error assigning reporting user:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
