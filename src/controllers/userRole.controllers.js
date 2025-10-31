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
export const createUserRole = async (req, res) => {
  try {
    const { roleName, description, permissions = [], enterprise = null } = req.body;
    const createdBy = req.user?._id || null;

    if (!roleName || !roleName.trim()) {
      return res.status(400).json(new apiError(400, "Role name is required"));
    }

    const normalizedRoleName = roleName.trim().toLowerCase();

    // 🔍 Check if role name already exists (optionally per enterprise)
    const existingRole = await UserRole.findOne({
      roleName: normalizedRoleName,
      enterprise: enterprise || null,
    });

    if (existingRole) {
      return res.status(400).json(new apiError(400, "Role name already exists"));
    }

    // 🧠 Prepare permissions structure (with tracking)
    const formattedPermissions = (permissions || []).map((perm) => ({
      name: perm,
      granted: true,
      modifiedAt: new Date(),
      modifiedBy: createdBy,
    }));

    // 🆕 Create new role
    const newRole = await UserRole.create({
      roleName: normalizedRoleName,
      description: description?.trim() || "",
      permissions: formattedPermissions,
      enterprise,
      createdBy,
      createdAt: new Date(),
    });

    // 🧹 Clean structured response
    const formattedResponse = {
      _id: newRole._id,
      roleName: newRole.roleName,
      description: newRole.description,
      isActive: newRole.isActive,
      totalPermissions: newRole.permissions?.length || 0,
      createdBy: createdBy || "System",
      createdAt: newRole.createdAt,
    };

    return res
      .status(201)
      .json(new apiResponse(201, formattedResponse, "User role created successfully"));
  } catch (error) {
    console.error("Error creating user role:", error);
    return res
      .status(500)
      .json(new apiError(500, "Error creating user role", error.message));
  }
};

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
export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { roleName, description, isActive } = req.body;
    const modifiedBy = req.user?._id || "System"; // get from JWT middleware

    if (!id) {
      return res.status(400).json(new apiError(400, "Role ID is required"));
    }

    // 🧩 Fetch the role first
    const existingRole = await UserRole.findById(id);
    if (!existingRole) {
      return res.status(404).json(new apiError(404, "Role not found"));
    }

    // 🚫 Duplicate roleName check
    if (roleName && roleName.trim().toLowerCase() !== existingRole.roleName) {
      const duplicateRole = await UserRole.findOne({
        roleName: roleName.trim().toLowerCase(),
        _id: { $ne: id },
      });
      if (duplicateRole) {
        return res
          .status(400)
          .json(new apiError(400, "Role name already exists. Choose another name."));
      }
      existingRole.roleName = roleName.trim().toLowerCase();
    }

    // ✅ Update allowed fields
    if (description) existingRole.description = description.trim();
    if (typeof isActive === "boolean") existingRole.isActive = isActive;

    // 🕓 Audit fields
    existingRole.lastModifiedBy = modifiedBy;
    existingRole.lastModifiedAt = new Date();

    const updatedRole = await existingRole.save();

    // 🧹 Clean Response Format
    const formattedRole = {
      _id: updatedRole._id,
      roleName: updatedRole.roleName,
      description: updatedRole.description,
      isActive: updatedRole.isActive,
      totalPermissions: updatedRole.permissions?.length || 0,
      lastModifiedBy: modifiedBy,
      lastModifiedAt: updatedRole.lastModifiedAt,
      updatedAt: updatedRole.updatedAt,
    };

    return res
      .status(200)
      .json(new apiResponse(200, formattedRole, "Role updated successfully"));
  } catch (error) {
    console.error("Error updating role:", error);
    return res
      .status(500)
      .json(new apiError(500, "Error updating user role", error.message));
  }
};


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
