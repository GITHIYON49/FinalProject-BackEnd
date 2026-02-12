import mongoose from "mongoose";
import { User, Task, Project, Notification } from "../models/index.js";
import sendEmail from "../utils/sendEmail.js";

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({})
      .populate("project", "name")
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("project", "name description")
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ message: error.message });
  }
};

export const createTask = async (req, res) => {
  try {
    const { title, description, status, type, priority, assignee, due_date } =
      req.body;

    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const isMember = project.members.some(
      (member) => member.user.toString() === req.user._id.toString(),
    );
    const isCreator = project.createdBy.toString() === req.user._id.toString();

    if (!isMember && !isCreator) {
      return res
        .status(403)
        .json({ message: "Not authorized to create tasks in this project" });
    }

    let validatedAssignee = null;
    if (assignee && assignee.trim() !== "") {
      if (!mongoose.Types.ObjectId.isValid(assignee)) {
        return res.status(400).json({ message: "Invalid assignee ID" });
      }

      const assigneeUser = await User.findById(assignee);
      if (!assigneeUser) {
        return res.status(404).json({ message: "Assignee user not found" });
      }

      validatedAssignee = assignee;
    }

    const task = await Task.create({
      title,
      description,
      status: status || "TODO",
      type: type || "TASK",
      priority: priority || "MEDIUM",
      project: req.params.projectId,
      assignee: validatedAssignee,
      createdBy: req.user._id,
      due_date: due_date || null,
    });

    const populatedTask = await Task.findById(task._id)
      .populate("project", "name")
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    if (validatedAssignee && validatedAssignee !== req.user._id.toString()) {
      setImmediate(async () => {
        try {
          const assigneeUser = await User.findById(validatedAssignee);

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">New Task Assigned to You!</h2>
              <p>Hi ${assigneeUser.name},</p>
              <p>${req.user.name} has assigned you a new task.</p>
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0;">${task.title}</h3>
                <p><strong>Description:</strong> ${task.description || "No description"}</p>
                <p><strong>Project:</strong> ${project.name}</p>
                <p><strong>Priority:</strong> <span style="color: ${
                  task.priority === "HIGH"
                    ? "#ef4444"
                    : task.priority === "MEDIUM"
                      ? "#3b82f6"
                      : "#6b7280"
                };">${task.priority}</span></p>
                <p><strong>Status:</strong> ${task.status.replace("_", " ")}</p>
                ${task.due_date ? `<p><strong>Due Date:</strong> ${new Date(task.due_date).toLocaleDateString()}</p>` : ""}
              </div>
              <p>
                <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects/${project._id}/tasks/${task._id}" 
                   style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0;">
                  View Task
                </a>
              </p>
            </div>
          `;

          await sendEmail({
            email: assigneeUser.email,
            subject: `New Task Assigned: ${task.title}`,
            html: emailHtml,
          });
        } catch (emailError) {
          console.error("⚠️ Email failed (non-critical):", emailError.message);
        }
      });

      setImmediate(async () => {
        try {
          await Notification.create({
            user: validatedAssignee,
            title: "Task Assigned",
            message: `${req.user.name} assigned you to: ${task.title}`,
            type: "TASK_ASSIGNED",
            link: `/projects/${task.project}/tasks/${task._id}`,
          });
          console.log("Notification created");
        } catch (notifError) {
          console.error("Notification failed:", notifError.message);
        }
      });
    }

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ message: error.message });
  }
};

export const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const project = await Project.findById(task.project);
    const isMember = project.members.some(
      (member) => member.user.toString() === req.user._id.toString(),
    );
    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAssignee = task.assignee?.toString() === req.user._id.toString();

    if (!isMember && !isCreator && !isAssignee) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this task" });
    }

    if (req.body.assignee !== undefined) {
      if (req.body.assignee && req.body.assignee.trim() !== "") {
        if (!mongoose.Types.ObjectId.isValid(req.body.assignee)) {
          return res.status(400).json({ message: "Invalid assignee ID" });
        }

        const assigneeUser = await User.findById(req.body.assignee);
        if (!assigneeUser) {
          return res.status(404).json({ message: "Assignee user not found" });
        }
      } else {
        req.body.assignee = null;
      }
    }

    const oldAssignee = task.assignee?.toString();

    Object.assign(task, req.body);
    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate("project", "name")
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    const newAssignee = task.assignee?.toString();
    if (
      newAssignee &&
      newAssignee !== oldAssignee &&
      newAssignee !== req.user._id.toString()
    ) {
      setImmediate(async () => {
        try {
          const assigneeUser = await User.findById(newAssignee);

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">Task Reassigned to You!</h2>
              <p>Hi ${assigneeUser.name},</p>
              <p>${req.user.name} has reassigned a task to you.</p>
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0;">${task.title}</h3>
                <p><strong>Description:</strong> ${task.description || "No description"}</p>
                <p><strong>Project:</strong> ${project.name}</p>
                <p><strong>Priority:</strong> ${task.priority}</p>
                <p><strong>Status:</strong> ${task.status.replace("_", " ")}</p>
                ${task.due_date ? `<p><strong>Due Date:</strong> ${new Date(task.due_date).toLocaleDateString()}</p>` : ""}
              </div>
              <p>
                <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects/${project._id}/tasks/${task._id}" 
                   style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">
                  View Task
                </a>
              </p>
            </div>
          `;

          await sendEmail({
            email: assigneeUser.email,
            subject: `Task Reassigned: ${task.title}`,
            html: emailHtml,
          });

          console.log("Reassignment email sent");
        } catch (emailError) {
          console.error("⚠️ Email failed:", emailError.message);
        }
      });

      setImmediate(async () => {
        try {
          await Notification.create({
            user: newAssignee,
            title: "Task Reassigned",
            message: `${req.user.name} reassigned you to: ${task.title}`,
            type: "TASK_ASSIGNED",
            link: `/projects/${task.project}/tasks/${task._id}`,
          });
        } catch (notifError) {
          console.error("⚠️ Notification failed:", notifError.message);
        }
      });
    }

    res.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: error.message });
  }
};

export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const project = await Project.findById(task.project);
    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAdmin = project.members.some(
      (member) =>
        member.user.toString() === req.user._id.toString() &&
        member.role === "ADMIN",
    );

    if (!isCreator && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this task" });
    }

    await Task.findByIdAndDelete(req.params.id);

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getMyTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ assignee: req.user._id })
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image")
      .populate("project", "name")
      .sort({ due_date: 1 });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const shareTask = async (req, res) => {
  try {
    const { userIds, permission, message } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Please provide user IDs to share with" });
    }

    const task = await Task.findById(req.params.id)
      .populate("project", "name")
      .populate("createdBy", "name");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const project = await Project.findById(task.project._id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const sharedWith = [];

    for (const userId of userIds) {
      const user = await User.findById(userId);

      if (!user) {
        console.log(`User not found`);
        continue;
      }

      const isMember = project.members.some(
        (member) => member.user.toString() === userId,
      );

      if (!isMember) {
        project.members.push({
          user: userId,
          role: "MEMBER",
        });
      }

      sharedWith.push({
        _id: user._id,
        name: user.name,
        email: user.email,
      });

      setImmediate(async () => {
        try {
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">Task Shared With You!</h2>
              <p>Hi ${user.name},</p>
              <p>${req.user.name} has shared a task with you.</p>
              ${
                message
                  ? `<div style="background-color: #e0f2fe; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
                <p style="margin: 0;"><em>"${message}"</em></p>
              </div>`
                  : ""
              }
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0;">${task.title}</h3>
                <p><strong>Description:</strong> ${task.description || "No description"}</p>
                <p><strong>Project:</strong> ${task.project.name}</p>
                <p><strong>Permission:</strong> ${permission === "edit" ? "Can Edit" : "View Only"}</p>
                <p><strong>Priority:</strong> ${task.priority}</p>
                <p><strong>Status:</strong> ${task.status.replace("_", " ")}</p>
              </div>
              <p>
                <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects/${task.project._id}/tasks/${task._id}" 
                   style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">
                  View Task
                </a>
              </p>
            </div>
          `;

          await sendEmail({
            email: user.email,
            subject: `Task Shared: ${task.title}`,
            html: emailHtml,
          });
        } catch (emailError) {
          console.error("⚠️ Email failed:", emailError.message);
        }
      });

      setImmediate(async () => {
        try {
          await Notification.create({
            user: userId,
            title: "Task Shared",
            message: `${req.user.name} shared a task with you: ${task.title}`,
            type: "TASK_SHARED",
            link: `/projects/${task.project._id}/tasks/${task._id}`,
          });
        } catch (notifError) {
          console.error("⚠️ Notification failed:", notifError.message);
        }
      });
    }

    await project.save();

    res.json({
      message: "Task shared successfully",
      sharedWith,
    });
  } catch (error) {
    console.error("Error sharing task:", error);
    res.status(500).json({ message: error.message });
  }
};

export const addAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    task.attachments.push({
      name: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
    });

    await task.save();

    console.log("Attachment added");

    const updatedTask = await Task.findById(task._id)
      .populate("project", "name")
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    res.json(updatedTask);
  } catch (error) {
    console.error("Error adding attachment:", error);
    res.status(500).json({ message: error.message });
  }
};

export const removeAttachment = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    task.attachments = task.attachments.filter(
      (attachment) => attachment._id.toString() !== req.params.attachmentId,
    );

    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate("project", "name")
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    res.json(updatedTask);
  } catch (error) {
    console.error("Error removing attachment:", error);
    res.status(500).json({ message: error.message });
  }
};
