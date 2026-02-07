import { Comment, Task, Notification } from "../models/index.js";

export const getComments = async (req, res) => {
  try {
    const comments = await Comment.find({ task: req.params.taskId })
      .populate("user", "name email image")
      .populate("parentComment")
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addComment = async (req, res) => {
  try {
    const { content, parentComment } = req.body;

    const task = await Task.findById(req.params.taskId).populate("project");
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const comment = await Comment.create({
      task: req.params.taskId,
      user: req.user._id,
      content,
      parentComment: parentComment || null,
    });

    const populatedComment = await Comment.findById(comment._id)
      .populate("user", "name email image")
      .populate("parentComment");

    if (task.assignee && task.assignee.toString() !== req.user._id.toString()) {
      await Notification.create({
        user: task.assignee,
        type: "TASK_COMMENT",
        title: "New Comment",
        message: `${req.user.name} commented on "${task.title}"`,
        link: `/projects/${task.project}/tasks/${task._id}`,
        relatedTask: task._id,
        relatedProject: task.project,
      });
    }

    res.status(201).json(populatedComment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    comment.content = req.body.content;
    await comment.save();

    const updatedComment = await Comment.findById(comment._id)
      .populate("user", "name email image")
      .populate("parentComment");

    res.json(updatedComment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await Comment.deleteMany({ parentComment: comment._id });

    await comment.deleteOne();

    res.json({ message: "Comment removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
