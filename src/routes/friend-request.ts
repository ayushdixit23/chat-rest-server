import express from "express";
import { verifyUserToken } from "../middlewares/auth.js";
import { createFriendRequest, fetchFriendRequest, respondFriendRequest,getUserSuggestion } from "../controllers/friend-request.js";

const router = express.Router();

router.post("/create-friend-request/:friendId", verifyUserToken, createFriendRequest);
router.post("/responsed-friend-request/:friendRequestId", verifyUserToken, respondFriendRequest);
router.get("/fetchFriendRequest", verifyUserToken, fetchFriendRequest);
router.get("/get-user-suggestion", verifyUserToken, getUserSuggestion);

export default router;
