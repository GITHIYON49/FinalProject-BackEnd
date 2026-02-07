import express from "express";
import {
  getUsers,
  getUserById,
  searchUsers,
  deleteUser,
} from "../controllers/userController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getUsers);
router.get("/search", protect, searchUsers);
router
  .route("/:id")
  .get(protect, getUserById)
  .delete(protect, admin, deleteUser);

export default router;
