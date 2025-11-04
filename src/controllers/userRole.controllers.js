import { UserRole } from "../models/userRole.model.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { ALL_PERMISSIONS } from "../config/permissions.js";

/* ============================================================
   ✅ CREATE USER ROLE
============================================================ */
/**
 * 🟢 Create a New User Role
 * - Prevents duplicate role names (global or per enterprise)
 * - Adds createdBy metadata
 * - Logs creation time
 */
import { asyncHandler } from "../utils/asyncHandler.js";

export const createUserRole = asyncHandler(async (req, res) => {
  const { roleName, description, permissions = [], enterprise } = req.body;

  if (!roleName?.trim()) throw new apiError(400, "Role name is required");

  // ✅ Prevent duplicate role names
  const existingRole = await UserRole.findOne({ roleName: roleName.trim() });
  if (existingRole) throw new apiError(409, "Role name already exists");

  // ✅ Normalize permissions (force correct schema)
  const normalizedPermissions = permissions.map((p) => {
    if (typeof p === "string") {
      return { action: p, granted: true };
    } else if (p?.action) {
      return {
        action: p.action.trim(),
        granted: p.granted ?? true,
        modifiedBy: req.user?._id || null,
        modifiedAt: new Date(),
      };
    } else if (typeof p === "object" && Object.keys(p).some((k) => k.match(/^\d+$/))) {
      // Handle the split-character case
      return {
        action: Object.values(p).join(""),
        granted: true,
        modifiedBy: req.user?._id || null,
        modifiedAt: new Date(),
      };
    }
    return null;
  }).filter(Boolean);

  const newRole = await UserRole.create({
    roleName: roleName.trim(),
    description,
    permissions: normalizedPermissions,
    enterprise: enterprise || null,
    createdBy: req.user?._id || null,
  });

  return res
    .status(201)
    .json(new apiResponse(201, newRole, "Role created successfully"));
});


/* ============================================================
   ✅ GET ALL USER ROLES
============================================================ */
export const getAllUserRoles = async (req, res) => {
  try {
    // ✅ Fetch all roles with creator info
    const roles = await UserRole.find()
      .populate("createdBy", "fullName username")
      .lean(); // use lean() for faster reads

    // ✅ Clean malformed permissions
    const cleanedRoles = roles.map((role) => {
      const fixedPermissions = (role.permissions || []).map((perm) => {
        // If permission is malformed (object with keys like 0,1,2)
        if (typeof perm.action === "object" || !perm.action) {
          const action =
            typeof perm === "object"
              ? Object.values(perm)
                  .filter((v) => typeof v === "string")
                  .join("")
              : String(perm);

          return {
            action,
            granted: perm.granted ?? true,
            modifiedAt: perm.modifiedAt || role.updatedAt,
          };
        }

        // otherwise return as-is
        return {
          action: perm.action,
          granted: perm.granted ?? true,
          modifiedAt: perm.modifiedAt || role.updatedAt,
        };
      });

      return {
        _id: role._id,
        roleName: role.roleName,
        permissions: fixedPermissions,
        description: role.description,
        isActive: role.isActive,
        createdBy: role.createdBy || null,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      };
    });

    // ✅ Send cleaned data
    res
      .status(200)
      .json(new apiResponse(200, cleanedRoles, "All roles fetched successfully"));
  } catch (error) {
    console.error("Error fetching roles:", error);
    res
      .status(500)
      .json(new apiError(500, "Error fetching roles", error.message));
  }
};

/* ============================================================
   ✅ GET ROLE BY ID
============================================================ */
export const getUserRoleById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json(new apiError(400, "Role ID is required"));
    }

    const role = await UserRole.findById(id)
      .populate("createdBy", "fullName username role")
      .lean();

    if (!role) {
      return res.status(404).json(new apiError(404, "Role not found"));
    }

    // 🧠 Handle permissions (support both string & object)
    const formattedPermissions =
      role.permissions?.map((perm) => {
        if (typeof perm === "string") {
          // old format
          return { action: perm, granted: true, modifiedBy: null, modifiedAt: role.updatedAt };
        } else if (perm && typeof perm === "object") {
          // new format
          return {
            action: perm.action || perm.name || "Unknown",
            granted: perm.granted ?? true,
            modifiedAt: perm.modifiedAt || role.updatedAt,
            modifiedBy: perm.modifiedBy || null,
          };
        } else {
          return { action: "Unknown", granted: false };
        }
      }) || [];

    // 🧩 Construct clean response
    const formattedRole = {
      _id: role._id,
      roleName: role.roleName,
      description: role.description || "No description available",
      isActive: role.isActive ?? true,
      totalPermissions: formattedPermissions.length,
      permissions: formattedPermissions,
      createdBy: role.createdBy
        ? {
            fullName: role.createdBy.fullName,
            username: role.createdBy.username,
          }
        : null,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };

    return res
      .status(200)
      .json(new apiResponse(200, formattedRole, "Role fetched successfully"));
  } catch (error) {
    console.error("Error fetching role by ID:", error);
    return res
      .status(500)
      .json(new apiError(500, "Error fetching role by ID", error.message));
  }
};

/* ============================================================
   ✅ UPDATE ROLE DETAILS (name, desc, etc.)
============================================================ */
/**
 * ✏️ Update UserRole (name, description, or status)
 * Keeps permissions intact unless explicitly changed.
 * Logs who modified the role and when.
 */
export const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { roleName, description, permissions, isActive } = req.body;

  const role = await UserRole.findById(id);
  if (!role) throw new apiError(404, "Role not found");

  // ✅ Prevent duplicate names (if changed)
  if (roleName && roleName.trim() !== role.roleName) {
    const existing = await UserRole.findOne({ roleName: roleName.trim(), _id: { $ne: id } });
    if (existing) throw new apiError(409, "Role name already exists");
  }

  // ✅ Normalize permissions (same logic as create)
  let normalizedPermissions = role.permissions;
  if (permissions && Array.isArray(permissions)) {
    normalizedPermissions = permissions.map((p) => {
      if (typeof p === "string") {
        return { action: p, granted: true };
      } else if (p?.action) {
        return {
          action: p.action.trim(),
          granted: p.granted ?? true,
          modifiedBy: req.user?._id || null,
          modifiedAt: new Date(),
        };
      } else if (typeof p === "object" && Object.keys(p).some((k) => k.match(/^\d+$/))) {
        return {
          action: Object.values(p).join(""),
          granted: true,
          modifiedBy: req.user?._id || null,
          modifiedAt: new Date(),
        };
      }
      return null;
    }).filter(Boolean);
  }

  // ✅ Update fields
  role.roleName = roleName?.trim() || role.roleName;
  role.description = description ?? role.description;
  role.permissions = normalizedPermissions;
  role.isActive = typeof isActive === "boolean" ? isActive : role.isActive;

  await role.save();

  return res
    .status(200)
    .json(new apiResponse(200, role, "Role updated successfully"));
});



/* ============================================================
   ✅ UPDATE / ADD ROLE PERMISSIONS
   (add or update specific permission)
============================================================ */
export const updateRolePermissions = async (req, res) => {
  try {
    const { id } = req.params; // role ID
    const { permissions } = req.body; // array of actions e.g. ["create_branch", "delete_user"]

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json(new apiError(400, "Permissions array is required"));
    }

    const role = await UserRole.findById(id);
    if (!role) return res.status(404).json(new apiError(404, "Role not found"));

    // loop through incoming permissions
    permissions.forEach((permAction) => {
      const existing = role.permissions.find((p) => p.action === permAction);

      if (existing) {
        // already exists → just update modified fields
        existing.granted = true;
        existing.modifiedBy = req.user?._id || null;
        existing.modifiedAt = new Date();
      } else {
        // add new permission
        role.permissions.push({
          action: permAction,
          granted: true,
          modifiedBy: req.user?._id || null,
          modifiedAt: new Date(),
        });
      }
    });

    await role.save();

    res.status(200).json(
      new apiResponse(200, role, "Permissions updated successfully")
    );
  } catch (error) {
    res
      .status(500)
      .json(new apiError(500, "Error updating role permissions", error.message));
  }
};



/* ============================================================
   ✅ REMOVE SPECIFIC ROLE PERMISSION
============================================================ */
export const removeRolePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions, deleteCompletely = false } = req.body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json(new apiError(400, "Permissions array is required"));
    }

    const role = await UserRole.findById(id);
    if (!role) {
      return res.status(404).json(new apiError(404, "Role not found"));
    }

    const currentUserId = req.user?._id || null;
    let modifiedCount = 0;

    // Normalize actions for comparison
    const normalized = permissions.map((p) => p.trim().toLowerCase());

    if (deleteCompletely) {
      // 🔴 Physically remove from array
      const originalLength = role.permissions.length;
      role.permissions = role.permissions.filter(
        (perm) => !normalized.includes(perm.action.toLowerCase())
      );
      modifiedCount = originalLength - role.permissions.length;
    } else {
      // 🟡 Soft-remove (set granted = false)
      role.permissions.forEach((perm) => {
        if (normalized.includes(perm.action.toLowerCase())) {
          perm.granted = false;
          perm.modifiedBy = currentUserId;
          perm.modifiedAt = new Date();
          modifiedCount++;
        }
      });
    }

    // Ensure Mongoose detects nested array changes
    role.markModified("permissions");
    await role.save();

    const message =
      modifiedCount > 0
        ? deleteCompletely
          ? "Permissions deleted successfully"
          : "Permissions removed (soft-disabled) successfully"
        : "No matching permissions found";

    return res.status(200).json(new apiResponse(200, role, message));
  } catch (error) {
    console.error("Error removing permissions:", error);
    return res
      .status(500)
      .json(new apiError(500, "Error removing role permissions", error.message));
  }
};


/* ============================================================
   ✅ GET ALL UNIQUE PERMISSIONS (for dropdowns / dashboards)
============================================================ */
export const getAllPermissions = async (req, res) => {
  try {
    if (!ALL_PERMISSIONS || !ALL_PERMISSIONS.length) {
      return res.status(404).json(new apiError(404, "No permissions configured"));
    }

    const totalPermissions = ALL_PERMISSIONS.length;

    const responseData = {
      total: totalPermissions,
      permissions: ALL_PERMISSIONS.sort(),
    };

    return res
      .status(200)
      .json(new apiResponse(200, responseData, "All system permissions fetched successfully"));
  } catch (error) {
    console.error("Error fetching permissions:", error);
    return res
      .status(500)
      .json(new apiError(500, "Error fetching permissions", error.message));
  }
};


/* ============================================================
   ✅ DELETE ROLE (Soft Delete: mark inactive)
============================================================ */
/**
 * ❌ Soft Delete / Deactivate a Role
 * - Marks the role as inactive instead of removing it permanently.
 * - Logs who deactivated it and when.
 */
export const deleteUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBy = req.user?._id || "System"; // From authenticateJWT middleware

    if (!id) {
      return res.status(400).json(new apiError(400, "Role ID is required"));
    }

    const role = await UserRole.findById(id);
    if (!role) {
      return res.status(404).json(new apiError(404, "Role not found"));
    }

    // 🟡 Prevent deactivating super admin (optional safety)
    if (role.roleName?.toLowerCase() === "super admin") {
      return res
        .status(403)
        .json(new apiError(403, "Super Admin role cannot be deactivated"));
    }

    // 🚫 If already inactive
    if (!role.isActive) {
      return res
        .status(200)
        .json(new apiResponse(200, role, "Role is already inactive"));
    }

    // 🔴 Soft Delete Logic
    role.isActive = false;
    role.deactivatedBy = deletedBy;
    role.deactivatedAt = new Date();

    const updatedRole = await role.save();

    // 🧹 Clean structured response
    const formattedRole = {
      _id: updatedRole._id,
      roleName: updatedRole.roleName,
      description: updatedRole.description,
      isActive: updatedRole.isActive,
      totalPermissions: updatedRole.permissions?.length || 0,
      deactivatedBy: deletedBy,
      deactivatedAt: updatedRole.deactivatedAt,
    };

    return res
      .status(200)
      .json(new apiResponse(200, formattedRole, "Role deactivated successfully"));
  } catch (error) {
    console.error("Error deleting role:", error);
    return res
      .status(500)
      .json(new apiError(500, "Error deleting user role", error.message));
  }
};



// controllers/user.controller.js
/**
 * 🧩 Change a User's Role (Secure)
 * - Validates that user and role exist
 * - Ensures role is active
 * - Logs who made the change
 */
