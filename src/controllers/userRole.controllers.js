import { UserRole } from "../models/userRole.model.js";
import { ALL_PERMISSIONS } from "../config/permissions.js";


// 🟣 Get all available permissions
export const getAllPermissions = async (req, res) => {
  try {
    console.log("DEBUG: getAllPermissions called");
    res.status(200).json({
      success: true,
      count: ALL_PERMISSIONS.length,
      data: ALL_PERMISSIONS,
    });
  } catch (error) {
    console.error("Error fetching permissions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Create User Role 
export const createUserRole = async (req, res) => {
  try {
    const { roleName, description } = req.body;

    if (!roleName) {
      return res.status(400).json({ message: "Role name is required" });
    }

    // Check if role already exists
    const existing = await UserRole.findOne({ roleName: roleName.trim().toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "Role name already exists" });
    }

    const role = await UserRole.create({
      roleName: roleName.trim().toLowerCase(),
      description,
    });

    res.status(201).json({
      success: true,
      message: "Role created successfully",
      data: role,
    });
  } catch (error) {
    console.error("Error creating role:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * 🟡 Get all roles
 * @route GET /api/roles
 */
export const getAllUserRoles = async (req, res) => {
  try {
    const roles = await UserRole.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: roles.length,
      data: roles,
    });
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * 🟣 Get single role by ID
 * @route GET /api/roles/:id
 */
export const getUserRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await UserRole.findById(id);

    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }

    res.status(200).json({ success: true, data: role });
  } catch (error) {
    console.error("Error fetching role:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * 🟠 Update a role (name or description)
 * @route PUT /api/roles/:id
 */
export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { roleName, description, isActive } = req.body;

    const role = await UserRole.findById(id);
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }

    if (roleName) role.roleName = roleName.trim().toLowerCase();
    if (description) role.description = description;
    if (isActive !== undefined) role.isActive = isActive;

    await role.save();

    res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: role,
    });
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * 🔵 Update role permissions
 * @route PUT /api/roles/:id/permissions
 */
export const updateRolePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ message: "Permissions must be a non-empty array" });
    }

    const role = await UserRole.findById(id);
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }

    // ✅ Find duplicates
    const alreadyHave = permissions.filter((p) => role.permissions.includes(p));
    const newPermissions = permissions.filter((p) => !role.permissions.includes(p));

    // ✅ Add only new ones
    role.permissions.push(...newPermissions);
    await role.save();

    return res.status(200).json({
      success: true,
      message: "Permissions updated successfully",
      added: newPermissions,
      alreadyExists: alreadyHave,
      totalPermissions: role.permissions,
    });
  } catch (error) {
    console.error("Error updating permissions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * 🔴 Delete a role
 * @route DELETE /api/roles/:id
 */
export const deleteUserRole = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await UserRole.findByIdAndDelete(id);
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }

    res.status(200).json({
      success: true,
      message: "Role deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting role:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};



// Remove role permissions 
export const removeRolePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    // 🧩 1. Validate input
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ message: "Permissions must be a non-empty array" });
    }

    // 🧩 2. Check role
    const role = await UserRole.findById(id);
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }

    // 🧩 3. Validate given permissions (must exist in ALL_PERMISSIONS)
    const invalidPermissions = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some permissions are invalid",
        invalidPermissions,
      });
    }

    // 🧩 4. Check which permissions are assigned to this role
    const notAssigned = permissions.filter((p) => !role.permissions.includes(p));
    const canRemove = permissions.filter((p) => role.permissions.includes(p));

    if (canRemove.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid permissions found to remove from this role",
        notAssigned,
      });
    }

    // 🧩 5. Remove only assigned ones
    role.permissions = role.permissions.filter((p) => !canRemove.includes(p));
    await role.save();

    return res.status(200).json({
      success: true,
      message: "Permissions removed successfully",
      removed: canRemove,
      notAssigned,
      remainingPermissions: role.permissions,
    });
  } catch (error) {
    console.error("Error removing permissions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
