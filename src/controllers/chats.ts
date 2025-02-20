import { Request, Response } from "express";
import asyncHandler from "../middlewares/tryCatch.js";
import { CustomError } from "../middlewares/errors/CustomError.js";
import User from "../models/user.js";
import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import mongoose from "mongoose";

export const getallchats = asyncHandler(async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    if (!userId) {
        throw new CustomError("UserId not provided", 400);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new CustomError("User not found", 404);
    }

    const conversations = await Conversation.find({ users: userId })
        .populate({
            path: "users",
            select: "fullName profilePic",
        })
        .populate({
            path: "groupAdmin",
            select: "fullName profilePic",
        })
        .populate({
            path: "lastMessage",
            select: "message createdAt",
        })
        .sort({ "lastMessage.createdAt": -1 });

    const chatData = conversations.map((conversation) => {
        if (conversation.isGroup) {
            return {
                _id: conversation._id,
                isGroup: true,
                groupName: conversation.groupName,
                groupAdmin: conversation.groupAdmin,
                users: conversation.users,
                lastMessage: conversation.lastMessage,
            };
        } else {
            const chatPartner = conversation.users.find(
                (user: any) => user._id.toString() !== userId
            );
            return {
                _id: conversation._id,
                isGroup: false,
                user: chatPartner,
                lastMessage: conversation.lastMessage,
            };
        }
    });

    res
        .status(200)
        .json({ message: "Get all chats", users: chatData, success: true });
});

export const getPrivateChat = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req?.user?.id;
        const { conversationId } = req.params;

        // Handle missing userId
        if (!userId) {
            throw new CustomError("UserId not provided", 400);
        }

        // Fetch user details
        const user = await User.findById(userId);
        if (!user) {
            throw new CustomError("User not found", 404);
        }

        // Fetch conversation details
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            throw new CustomError("Conversation not found", 404);
        }

        // Check if the user is part of the conversation
        if (!conversation.users.includes(user._id)) {
            throw new CustomError("You are not a part of this conversation", 400);
        }

        // Fetch messages for the conversation and populate sender details
        const messages = await Message.find({
            conversationId: conversationId,
        }).populate("senderId", "fullName profilePic");

        // Prepare response data2
        let conversationData: any = {
            conversationId: conversation._id,
            isGroup: conversation.isGroup,
            messages: messages,
        };

        if (conversation.isGroup) {
            // Fetch all group users excluding the admin (to prevent duplication)
            const groupUsers = await User.find({
                _id: { $in: conversation.users, $nin: [conversation.groupAdmin] },
            }).select("fullName profilePic");

            // Fetch group admin's details separately and mark them as isAdmin
            const groupAdmin = await User.findById(conversation.groupAdmin).select(
                "fullName profilePic"
            );

            if (groupAdmin) {
                // Add the group admin with isAdmin flag set to true
                const groupAdminWithIsAdmin = {
                    ...groupAdmin.toObject(),
                    isAdmin: true,
                };
                conversationData.groupUsers = [...groupUsers, groupAdminWithIsAdmin];
            } else {
                conversationData.groupUsers = groupUsers
            }
            conversationData.groupName = conversation.groupName;
        } else {
            // For private chat, include the other user's data
            const otherUser = conversation.users.find(
                (userId: mongoose.Types.ObjectId) =>
                    userId.toString() !== user._id.toString()
            );
            const otherUserData = await User.findById(otherUser).select(
                "fullName profilePic"
            );
            conversationData.otherUser = otherUserData;
        }

        // Return response based on whether it's a group or private chat
        res.status(200).json({
            message: conversation.isGroup ? "Get group chat" : "Get private chat",
            success: true,
            conversation: conversationData,
        });
    }
);