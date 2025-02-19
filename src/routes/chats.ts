import express from "express";
import { verifyUserToken } from "../middlewares/auth.js";
import { createFriendRequest, fetchFriendRequest, getallchats, getUserSuggestion, respondFriendRequest } from "../controllers/chats.js";

const router = express.Router();

router.post("/create-friend-request/:friendId", verifyUserToken, createFriendRequest);
router.post("/responsed-friend-request/:friendRequestId", verifyUserToken, respondFriendRequest);
router.get("/getallchats", verifyUserToken, getallchats);
router.get("/get-user-suggestion", verifyUserToken, getUserSuggestion);
router.get("/fetchFriendRequest", verifyUserToken, fetchFriendRequest);

export default router;
