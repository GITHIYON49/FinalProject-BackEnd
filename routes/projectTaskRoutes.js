import express from "express";
import { getTasks, createTask } from "../controllers/taskController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router({ mergeParams: true });

router.route("/").get(protect, getTasks).post(protect, createTask);

export default router;
