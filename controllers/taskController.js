import { Task, Project, User, Notification, Comment } from "../models/index.js";
import sendEmail from "../utils/sendEmail.js";
import { emailTemplates } from "../config/email.js";
import mongoose from "mongoose";

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ project: req.params.projectId })
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image")
      .populate("project", "name")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image")
      .populate("project", "name")
      .populate("attachments.uploadedBy", "name email");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createTask = async (req, res) => {
  try {
    const { title, description, status, type, priority, assignee, due_date } =
      req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({ message: "Task title is required" });
    }

    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    let validatedAssignee = null;
    let assigneeUser = null;

    if (assignee && assignee.trim() !== "") {
      if (!mongoose.Types.ObjectId.isValid(assignee)) {
        return res.status(400).json({ message: "Invalid assignee ID" });
      }

      assigneeUser = await User.findById(assignee);
      if (!assigneeUser) {
        return res.status(404).json({ message: "Assignee user not found" });
      }

      validatedAssignee = assignee;
    }

    const task = await Task.create({
      project: req.params.projectId,
      title: title.trim(),
      description: description?.trim() || "",
      status: status || "TODO",
      type: type || "TASK",
      priority: priority || "MEDIUM",
      assignee: validatedAssignee,
      due_date: due_date || null,
      createdBy: req.user._id,
      attachments: [],
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image")
      .populate("project", "name");

    if (validatedAssignee && validatedAssignee !== req.user._id.toString()) {
      await Notification.create({
        user: validatedAssignee,
        type: "TASK_ASSIGNED",
        title: "New Task Assigned",
        message: `${req.user.name} assigned you to "${title}"`,
        link: `/projects/${req.params.projectId}/tasks/${task._id}`,
        relatedTask: task._id,
        relatedProject: req.params.projectId,
      });

      try {
        const dueDateInfo = due_date
          ? `<p><strong>Due Date:</strong> ${new Date(due_date).toLocaleDateString()}</p>`
          : "";

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">New Task Assigned to You</h2>
            <p>Hi ${assigneeUser.name},</p>
            <p>${req.user.name} has assigned you a new task:</p>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">${title}</h3>
              <p>${description || "No description provided"}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
              <p><strong>Project:</strong> ${project.name}</p>
              <p><strong>Priority:</strong> ${priority}</p>
              <p><strong>Status:</strong> ${status.replace("_", " ")}</p>
              ${dueDateInfo}
            </div>
            <p>
              <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects/${req.params.projectId}/tasks/${task._id}" 
                 style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0;">
                View Task
              </a>
            </p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              You're receiving this email because you were assigned to a task in ${project.name}.
            </p>
          </div>
        `;

        await sendEmail({
          email: assigneeUser.email,
          subject: `New Task Assigned: ${title}`,
          html: emailHtml,
        });
      } catch (emailError) {
        console.error("⚠️ Email failed (non-critical):", emailError.message);
      }
    }

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error("❌ Error creating task:", error);
    res.status(500).json({ message: error.message });
  }
};

export const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const oldAssignee = task.assignee?.toString();
    const newAssignee = req.body.assignee;

    Object.keys(req.body).forEach((key) => {
      if (key !== "createdBy" && key !== "project") {
        task[key] = req.body[key];
      }
    });

    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image")
      .populate("project", "name");

    if (newAssignee && newAssignee !== oldAssignee) {
      await Notification.create({
        user: newAssignee,
        type: "TASK_ASSIGNED",
        title: "Task Reassigned",
        message: `You have been assigned to "${task.title}"`,
        link: `/projects/${task.project}/tasks/${task._id}`,
        relatedTask: task._id,
        relatedProject: task.project,
      });

      const assignedUser = await User.findById(newAssignee);
      if (assignedUser) {
        const project = await Project.findById(task.project);
        try {
          await sendEmail({
            email: assignedUser.email,
            subject: "Task Reassigned",
            html: emailTemplates.taskAssigned(
              task.title,
              req.user.name,
              project.name,
            ),
          });
        } catch (emailError) {
          console.error("Email failed:", emailError);
        }
      }
    }

    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await task.deleteOne();

    res.json({ message: "Task removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addAttachment = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const attachment = {
      name: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      type: req.file.mimetype,
      uploadedBy: req.user._id,
    };

    task.attachments.push(attachment);
    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image")
      .populate("attachments.uploadedBy", "name email");

    res.json(updatedTask);
  } catch (error) {
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
      (att) => att._id.toString() !== req.params.attachmentId,
    );

    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate("assignee", "name email image")
      .populate("createdBy", "name email image");

    res.json(updatedTask);
  } catch (error) {
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

    if (!userIds || userIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Please select at least one user to share with" });
    }

    const task = await Task.findById(req.params.id)
      .populate("project", "name")
      .populate("createdBy", "name email");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const project = await Project.findById(task.project._id);

    const sharedWithUsers = [];

    for (const userId of userIds) {
      const user = await User.findById(userId);
      if (!user) {
        console.log(`⚠️ User ${userId} not found, skipping`);
        continue;
      }

      const isMember = project.members.some(
        (m) => m.user.toString() === userId,
      );

      if (!isMember) {
        project.members.push({
          user: userId,
          role: permission === "edit" ? "MEMBER" : "MEMBER",
        });
      }

      await Notification.create({
        user: userId,
        type: "TASK_ASSIGNED",
        title: "Task Shared with You",
        message: `${req.user.name} shared a task "${task.title}" with you`,
        link: `/projects/${task.project._id}/tasks/${task._id}`,
        relatedTask: task._id,
        relatedProject: task.project._id,
      });

      try {
        const permissionText = permission === "edit" ? "edit" : "view";
        const customMessage = message ? `<p><em>"${message}"</em></p>` : "";

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">Task Shared with You</h2>
            <p>Hi ${user.name},</p>
            <p>${req.user.name} has shared a task with you:</p>
            ${customMessage}
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">${task.title}</h3>
              <p>${task.description || "No description provided"}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
              <p><strong>Project:</strong> ${project.name}</p>
              <p><strong>Priority:</strong> ${task.priority}</p>
              <p><strong>Permission:</strong> You can ${permissionText} this task</p>
              ${task.due_date ? `<p><strong>Due Date:</strong> ${new Date(task.due_date).toLocaleDateString()}</p>` : ""}
            </div>
            <p>
              <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects/${task.project._id}/tasks/${task._id}" 
                 style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0;">
                View Task
              </a>
            </p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              You're receiving this email because ${req.user.name} shared a task with you.
            </p>
          </div>
        `;

        await sendEmail({
          email: user.email,
          subject: `${req.user.name} shared a task with you: ${task.title}`,
          html: emailHtml,
        });
      } catch (emailError) {
        console.error(
          `⚠️ Failed to send email to ${user.email}:`,
          emailError.message,
        );
      }

      sharedWithUsers.push(user);
    }

    await project.save();

    res.json({
      message: `Task shared with ${sharedWithUsers.length} user(s)`,
      sharedWith: sharedWithUsers.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
      })),
    });
  } catch (error) {
    console.error("❌ Error sharing task:", error);
    res.status(500).json({ message: error.message });
  }
};
