import User from "../models/User.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";

export const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select("-password");

    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      req.user._id.toString() !== req.params.id &&
      req.user.role !== "ADMIN"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this account" });
    }

    if (req.body.name) user.name = req.body.name;
    if (req.body.email) user.email = req.body.email;
    if (req.body.image !== undefined) user.image = req.body.image;

    if (req.body.role && req.user.role === "ADMIN") {
      user.role = req.body.role;
    }

    await user.save();

    const updatedUser = await User.findById(user._id).select("-password");

    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      req.user._id.toString() !== req.params.id &&
      req.user.role !== "ADMIN"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this account" });
    }

    if (user.isTeamOwner) {
      const userCount = await User.countDocuments();
      if (userCount > 1) {
        return res.status(400).json({
          message:
            "Cannot delete team owner account. Please transfer ownership first or delete all other users.",
        });
      }
    }

    await Task.updateMany({ assignee: user._id }, { $set: { assignee: null } });

    await Project.updateMany(
      { "members.user": user._id },
      { $pull: { members: { user: user._id } } },
    );

    await Task.updateMany(
      { createdBy: user._id },
      { $set: { createdBy: null } },
    );

    await Project.updateMany(
      { createdBy: user._id },
      { $set: { createdBy: null } },
    );

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: "User account deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: error.message });
  }
};

export const searchUsers = async (req, res) => {
  try {
    const searchTerm = req.query.q;

    if (!searchTerm) {
      return res.status(400).json({ message: "Search term is required" });
    }

    const users = await User.find({
      $or: [
        { name: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
      ],
    })
      .select("-password")
      .limit(10);

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
