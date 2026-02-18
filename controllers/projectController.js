import mongoose from "mongoose";
import sendEmail from "../utils/sendEmail.js";
import { Task, Project, User, Notification } from "../models/index.js";

export const getProjects = async (req, res) => {
  try {
    const tasksAssignedToUser = await Task.find({
      assignee: req.user._id,
    }).distinct("project");

    const projects = await Project.find({
      $or: [
        { createdBy: req.user._id },
        { "members.user": req.user._id },
        { team_lead: req.user._id },
        { _id: { $in: tasksAssignedToUser } },
      ],
    })
      .populate("createdBy", "name email image")
      .populate("team_lead", "name email image")
      .populate("members.user", "name email image")
      .sort({ createdAt: -1 });

    const projectsWithTasks = await Promise.all(
      projects.map(async (project) => {
        const tasks = await Task.find({ project: project._id })
          .populate("assignee", "name email image")
          .populate("createdBy", "name email image")
          .sort({ createdAt: -1 });

        return {
          ...project.toObject(),
          tasks,
        };
      }),
    );

    res.json(projectsWithTasks);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("createdBy", "name email image")
      .populate("team_lead", "name email image")
      .populate("members.user", "name email image");

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const isMember = project.members.some(
      (member) => member.user._id.toString() === req.user._id.toString(),
    );
    const isCreator =
      project.createdBy._id.toString() === req.user._id.toString();
    const isTeamLead =
      project.team_lead?._id.toString() === req.user._id.toString();

    const tasks = await Task.find({ project: project._id })
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    const hasAssignedTask = tasks.some(
      (task) => task.assignee?._id.toString() === req.user._id.toString(),
    );

    if (!isMember && !isCreator && !isTeamLead && !hasAssignedTask) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this project" });
    }

    res.json({
      ...project.toObject(),
      tasks,
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ message: error.message });
  }
};

export const createProject = async (req, res) => {
  try {
    const project = await Project.create({
      ...req.body,
      createdBy: req.user._id,
      members: [
        {
          user: req.user._id,
          role: "ADMIN",
        },
      ],
    });

    const populatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email image")
      .populate("team_lead", "name email image")
      .populate("members.user", "name email image");

    res.status(201).json({
      ...populatedProject.toObject(),
      tasks: [],
    });
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ message: error.message });
  }
};

export const updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAdmin = project.members.some(
      (member) =>
        member.user.toString() === req.user._id.toString() &&
        member.role === "ADMIN",
    );

    if (!isCreator && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this project" });
    }

    Object.assign(project, req.body);
    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email image")
      .populate("team_lead", "name email image")
      .populate("members.user", "name email image");

    const tasks = await Task.find({ project: project._id })
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    res.json({
      ...updatedProject.toObject(),
      tasks,
    });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ message: error.message });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.createdBy.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this project" });
    }

    await Task.deleteMany({ project: project._id });
    await Project.findByIdAndDelete(req.params.id);

    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ message: error.message });
  }
};

export const addMember = async (req, res) => {
  try {
    const { userId, role } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAdmin = project.members.some(
      (member) =>
        member.user.toString() === req.user._id.toString() &&
        member.role === "ADMIN",
    );

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to add members" });
    }

    const userToAdd = await User.findById(userId);
    if (!userToAdd) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMember = project.members.some(
      (member) => member.user.toString() === userId,
    );

    if (isMember) {
      return res.status(400).json({ message: "User is already a member" });
    }

    project.members.push({
      user: userId,
      role: role || "MEMBER",
    });

    await project.save();

    setImmediate(async () => {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">You've been added to a project!</h2>
            <p>Hi ${userToAdd.name},</p>
            <p>${req.user.name} has added you to the project: <strong>${project.name}</strong></p>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Project Details</h3>
              <p><strong>Name:</strong> ${project.name}</p>
              <p><strong>Description:</strong> ${project.description || "No description"}</p>
              <p><strong>Your Role:</strong> ${role || "MEMBER"}</p>
            </div>
            <p>
              <a href="${process.env.FRONTEND_URL || "http://localhost:5000"}/projects/${project._id}" 
                 style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0;">
                View Project
              </a>
            </p>
          </div>
        `;

        await sendEmail({
          email: userToAdd.email,
          subject: `Added to Project: ${project.name}`,
          html: emailHtml,
        });
      } catch (emailError) {
        console.error("⚠️ Email failed (non-critical):", emailError.message);
      }
    });

    setImmediate(async () => {
      try {
        await Notification.create({
          user: userId,
          title: "Added to Project",
          message: `${req.user.name} added you to ${project.name}`,
          type: "PROJECT_MEMBER",
          link: `/projects/${project._id}`,
          read: false,
        });
      } catch (notifError) {
        console.error(
          "⚠️ Notification failed (non-critical):",
          notifError.message,
        );
      }
    });

    const updatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email image")
      .populate("team_lead", "name email image")
      .populate("members.user", "name email image");

    const tasks = await Task.find({ project: project._id })
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    res.json({
      ...updatedProject.toObject(),
      tasks,
    });
  } catch (error) {
    console.error("Error adding member:", error);
    res.status(500).json({
      message: error.message || "Failed to add member",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const removeMember = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const isAdmin = project.members.some(
      (member) =>
        member.user.toString() === req.user._id.toString() &&
        member.role === "ADMIN",
    );

    if (!isAdmin && project.createdBy.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to remove members" });
    }

    if (project.createdBy.toString() === req.params.userId) {
      return res.status(400).json({ message: "Cannot remove project creator" });
    }

    const memberExists = project.members.some(
      (member) => member.user.toString() === req.params.userId,
    );

    if (!memberExists) {
      return res
        .status(400)
        .json({ message: "User is not a member of this project" });
    }

    project.members = project.members.filter(
      (member) => member.user.toString() !== req.params.userId,
    );

    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email image")
      .populate("team_lead", "name email image")
      .populate("members.user", "name email image");

    const tasks = await Task.find({ project: project._id })
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    res.json({
      ...updatedProject.toObject(),
      tasks,
    });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ message: error.message });
  }
};
