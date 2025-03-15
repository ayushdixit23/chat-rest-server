import express from "express";
import { verifyUserToken } from "../middlewares/auth.js";
import { addMembersToGroup, createGroup, deleteGroup, fetchGroups, leaveGroup, removeMembersFromGroup } from "../controllers/group.js";
import upload from "../middlewares/multer.js";

const router = express.Router();

router.post("/create-group", upload.single("groupPic"), verifyUserToken, createGroup);
router.put("/update-group/:groupId", upload.single("groupPic"), verifyUserToken, createGroup);
router.post("/add-members/:groupId", verifyUserToken, addMembersToGroup);
router.post("/remove-members/:groupId", verifyUserToken, removeMembersFromGroup);
router.delete("/delete-group/:groupId", verifyUserToken, deleteGroup);
router.post("/leave-group/:groupId", verifyUserToken, leaveGroup);
router.get("/fetch-groups", verifyUserToken, fetchGroups)

export default router;
