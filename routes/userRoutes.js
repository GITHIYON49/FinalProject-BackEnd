import express from "express";
import {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
} from "../controllers/userController.js";
import { protect} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getUsers);

router.get("/:id", protect, getUser);

router.put("/:id", protect, updateUser);

router.delete("/:id", protect, deleteUser);

export default router;
