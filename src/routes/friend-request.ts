import express from "express";
import { verifyUserToken } from "../middlewares/auth.js";
import { createFriendRequest, fetchFriendRequest, respondFriendRequest,getUserSuggestion, fetchSentFriendRequest, fetchAddFriends, cancelFriendRequestByUserItSelf } from "../controllers/friend-request.js";

const router = express.Router();

router.post("/create-friend-request/:friendId", verifyUserToken, createFriendRequest);
router.post("/responsed-friend-request/:friendRequestId", verifyUserToken, respondFriendRequest);
router.get("/fetchFriendRequest", verifyUserToken, fetchFriendRequest);
router.get("/get-user-suggestion", verifyUserToken, getUserSuggestion);
router.get("/fetchSentFriendRequest", verifyUserToken, fetchSentFriendRequest);
router.get("/fetch-add-friends/:groupId", verifyUserToken, fetchAddFriends);
router.post("/cancel-request-user-itself/:requestId", verifyUserToken, cancelFriendRequestByUserItSelf);

export default router;
