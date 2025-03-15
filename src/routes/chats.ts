import express from "express";
import { verifyUserToken } from "../middlewares/auth.js";
import { generatePresignedurl, getallchats, getChatsByQuery, getDownloadUrl, getMoreChats, getOlderMessages, getPrivateChat } from "../controllers/chats.js";

const router = express.Router();

router.get("/getallchats", verifyUserToken, getallchats);
router.get("/getMoreChats", verifyUserToken, getMoreChats);
router.get(`/getprivatechat/:conversationId`, verifyUserToken, getPrivateChat);
router.get(`/getOlderMessages/:conversationId`, verifyUserToken, getOlderMessages);
router.post("/generate-presignedurl", verifyUserToken, generatePresignedurl);
router.post("/generateDowloadUrl", verifyUserToken, getDownloadUrl);
router.get("/getChatsByQuery", verifyUserToken, getChatsByQuery);

export default router;
