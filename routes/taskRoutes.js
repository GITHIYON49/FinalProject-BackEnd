import express from "express";
import {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  addAttachment,
  removeAttachment,
  getMyTasks,
  shareTask,
} from "../controllers/taskController.js";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";

const router = express.Router({ mergeParams: true });

router.get("/my-tasks", protect, getMyTasks);

router.route("/").get(protect, getTasks).post(protect, createTask);

router
  .route("/:id")
  .get(protect, getTask)
  .put(protect, updateTask)
  .delete(protect, deleteTask);

router.post("/:id/attachments", protect, upload.single("file"), addAttachment);
router.delete("/:id/attachments/:attachmentId", protect, removeAttachment);

router.post("/:id/share", protect, shareTask);

export default router;
