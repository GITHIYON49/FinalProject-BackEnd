import { Project, Task, User, Notification, Comment } from "../models/index.js";
import sendEmail from "../utils/sendEmail.js";
import { emailTemplates } from "../config/email.js";

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
        try {
          const tasks = await Task.find({ project: project._id })
            .populate("assignee", "name email image")
            .populate("createdBy", "name email image");

          return {
            ...project.toObject(),
            tasks,
          };
        } catch (taskError) {
          console.error(
            `  ├─ Error loading tasks for project ${project._id}:`,
            taskError,
          );
          return {
            ...project.toObject(),
            tasks: [],
          };
        }
      }),
    );

    res.json(projectsWithTasks);
  } catch (error) {
    console.error("Error fetching projects:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      message: error.message,
      error:
        process.env.NODE_ENV === "development"
          ? error.stack
          : "Internal server error",
    });
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

    const hasAccess =
      project.createdBy._id.toString() === req.user._id.toString() ||
      project.members.some(
        (member) => member.user._id.toString() === req.user._id.toString(),
      ) ||
      (project.team_lead &&
        project.team_lead._id.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res
        .status(403)
        .json({ message: "Not authorized to access this project" });
    }

    const tasks = await Task.find({ project: project._id })
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

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
    const {
      name,
      description,
      status,
      priority,
      start_date,
      end_date,
      team_lead,
    } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Project name is required" });
    }

    const project = await Project.create({
      name: name.trim(),
      description: description?.trim() || "",
      status: status || "PLANNING",
      priority: priority || "MEDIUM",
      start_date: start_date || null,
      end_date: end_date || null,
      team_lead: team_lead || req.user._id,
      createdBy: req.user._id,
      members: [
        {
          user: req.user._id,
          role: "ADMIN",
        },
      ],
      progress: 0,
    });

    const populatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email image")
      .populate("team_lead", "name email image")
      .populate("members.user", "name email image");

    const response = {
      ...populatedProject.toObject(),
      tasks: [],
    };

    res.status(201).json(response);
  } catch (error) {
    console.error("Error creating project:", error);
    console.error("Error details:", error.message);
    console.error("Stack:", error.stack);
    res.status(500).json({
      message: error.message,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const updateProject = async (req, res) => {
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
        .json({ message: "Not authorized to update this project" });
    }

    const allowedUpdates = [
      "name",
      "description",
      "status",
      "priority",
      "start_date",
      "end_date",
      "team_lead",
      "progress",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        project[field] = req.body[field];
      }
    });

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

    const tasks = await Task.find({ project: project._id });
    const taskIds = tasks.map((task) => task._id);

    const deletedComments = await Comment.deleteMany({
      task: { $in: taskIds },
    });

    const deletedTasks = await Task.deleteMany({ project: project._id });

    const deletedNotifications = await Notification.deleteMany({
      relatedProject: project._id,
    });

    await project.deleteOne();

    res.json({
      message: "Project removed successfully",
      deletedTasks: deletedTasks.deletedCount,
      deletedComments: deletedComments.deletedCount,
      deletedNotifications: deletedNotifications.deletedCount,
    });
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
      return res.status(403).json({ message: "Not authorized to add members" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMember = project.members.some(
      (member) => member.user.toString() === userId,
    );

    if (isMember) {
      return res
        .status(400)
        .json({ message: "User is already a member of this project" });
    }

    project.members.push({
      user: userId,
      role: role || "MEMBER",
    });

    await project.save();

    await Notification.create({
      user: userId,
      type: "PROJECT_INVITE",
      title: "Added to Project",
      message: `You have been added to ${project.name}`,
      link: `/projects/${project._id}`,
      relatedProject: project._id,
    });

    try {
      await sendEmail({
        email: user.email,
        subject: "Added to Project",
        html: emailTemplates.projectInvite(project.name, req.user.name),
      });
    } catch (emailError) {
      console.log("  ├─ Email failed (non-critical):", emailError.message);
    }

    const updatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email image")
      .populate("team_lead", "name email image")
      .populate("members.user", "name email image");

    res.json(updatedProject);
  } catch (error) {
    console.error("Error adding member:", error);
    res.status(500).json({ message: error.message });
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
