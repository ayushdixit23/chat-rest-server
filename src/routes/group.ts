import express from "express";
import { verifyUserToken } from "../middlewares/auth.js";
import { addMembersToGroup, createGroup, deleteGroup, removeMembersFromGroup } from "../controllers/group.js";
import upload from "../middlewares/multer.js";

const router = express.Router();

router.post("/create-group", upload.single("groupPic"), verifyUserToken, createGroup);
router.put("/update-group/:groupId", upload.single("groupPic"), verifyUserToken, createGroup);
router.post("/add-members/:groupId", verifyUserToken, addMembersToGroup);
router.post("/remove-members/:groupId", verifyUserToken, removeMembersFromGroup);
router.delete("/delete-group/:groupId", verifyUserToken, deleteGroup);

export default router;
