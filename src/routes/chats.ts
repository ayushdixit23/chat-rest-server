import express from "express";
import { verifyUserToken } from "../middlewares/auth.js";
import { generatePresignedurl, getallchats, getPrivateChat } from "../controllers/chats.js";

const router = express.Router();

router.get("/getallchats", verifyUserToken, getallchats);
router.get(`/getprivatechat/:conversationId`, verifyUserToken, getPrivateChat);
router.post("/generate-presignedurl", verifyUserToken, generatePresignedurl);

export default router;
