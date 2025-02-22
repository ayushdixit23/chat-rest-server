import express from "express";
import { verifyUserToken } from "../middlewares/auth.js";
import { getallchats, getPrivateChat } from "../controllers/chats.js";

const router = express.Router();

router.get("/getallchats", verifyUserToken, getallchats);
router.get(`/getprivatechat/:conversationId`, verifyUserToken, getPrivateChat);

export default router;
