import express from "express";
import { verifyUserToken } from "../middlewares/auth.js";
import { generatePresignedurl, getallchats, getMoreChats, getOlderMessages, getPrivateChat } from "../controllers/chats.js";

const router = express.Router();

router.get("/getallchats", verifyUserToken, getallchats);
router.get("/getMoreChats", verifyUserToken, getMoreChats);
router.get(`/getprivatechat/:conversationId`, verifyUserToken, getPrivateChat);
router.get(`/getOlderMessages/:conversationId`, verifyUserToken, getOlderMessages);
router.post("/generate-presignedurl", verifyUserToken, generatePresignedurl);

export default router;
