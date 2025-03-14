import { Request, Response } from "express";
import { CustomError } from "../middlewares/errors/CustomError.js";
import asyncHandler from "../middlewares/tryCatch.js";
import Conversation from "../models/conversation.js";
import User from "../models/user.js";
import { getUniqueMediaName } from "../utils/utils.js";
import Message from "../models/message.js";
import { BUCKET_NAME, CLOUDFRONT_URL } from "../utils/envConfig.js";
import { uploadToS3 } from "../utils/s3.config.js";
import mongoose from "mongoose";

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    if (!userId) {
        throw new CustomError("UserId not provided", 400);
    }

    const { groupName, description } = req.body;

    if (!groupName) {
        throw new CustomError("Group name not provided", 400);
    }

    if (!req.file) {
        throw new CustomError("Group pic not provided", 400);
    }

    const picName = getUniqueMediaName(req.file.originalname);
    const groupProfile = `profilePics/${picName}`;

    const conversation = new Conversation({
        groupName,
        groupAdmin: userId,
        isGroup: true,
        users: [userId],
        groupDescription: description,
        groupPic: `${CLOUDFRONT_URL}${groupProfile}`,
        lastMessage: null,
        messages: [],
    });

    await Promise.all([
        conversation.save(),
        uploadToS3(BUCKET_NAME, groupProfile, req.file.buffer, req.file.mimetype),
    ]);

    await User.findByIdAndUpdate(userId, {
        $push: { conversation: conversation._id },
    });

    res.status(200).json({ message: "Group created!", success: true });
});

export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { groupId } = req.params;
    const { groupName, description } = req.body;

    if (!userId) throw new CustomError("UserId not provided", 400);
    if (!groupId) throw new CustomError("Group ID not provided", 400);

    const updateData: any = {};
    if (groupName) updateData.groupName = groupName;
    if (req.file) {
        const picName = getUniqueMediaName(req.file.originalname);
        const groupProfile = `profilePics/${picName}`;
        updateData.groupPic = `${CLOUDFRONT_URL}${groupProfile}`;
    }
    if (description) updateData.groupDescription = description;

    if (Object.keys(updateData).length === 0) {
        throw new CustomError("No valid fields to update", 400);
    }

    // Find and update group if user is the admin
    const updatedGroup = await Conversation.findOneAndUpdate(
        { _id: groupId, groupAdmin: userId, isGroup: true },
        { $set: updateData },
        { new: true }
    );

    if (!updatedGroup)
        throw new CustomError("Group not found or unauthorized", 404);

    res.status(200).json({
        message: "Group updated successfully!",
        success: true,
        group: updatedGroup,
    });
});

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { groupId } = req.params;

    if (!userId) throw new CustomError("UserId not provided", 400);
    if (!groupId) throw new CustomError("Group ID not provided", 400);

    const conversation = await Conversation.findOneAndDelete({
        _id: groupId,
        isGroup: true,
        groupAdmin: userId,
    });

    if (!conversation)
        throw new CustomError("Group not found or unauthorized", 404);

    await Promise.all([
        User.updateMany(
            { conversation: conversation._id },
            { $pull: { conversation: conversation._id } }
        ),
        Message.deleteMany({ conversationId: conversation._id }),
    ]);

    res.status(200).json({ message: "Group deleted!", success: true });
});

export const addMembersToGroup = asyncHandler(async (req: Request, res: Response) => {
        const userId = req?.user?.id;
        const { groupId } = req.params;
        const { members } = req.body;

        if (!userId) throw new CustomError("UserId not provided", 400);
        if (!groupId) throw new CustomError("Group ID not provided", 400);
        if (!Array.isArray(members) || members.length === 0) {
            throw new CustomError("Members array not provided or empty", 400);
        }
        if (members.includes(userId)) {
            throw new CustomError("You cannot add yourself to the group", 400);
        }

        // Fetch all members in a single query
        const users = await User.find({ _id: { $in: members } }).select(
            "_id friends"
        );

        // Validate all members exist
        if (users.length !== members.length) {
            throw new CustomError("One or more member IDs are invalid", 400);
        }

        // Validate all members are friends with the user
        for (const user of users) {
            if (!user.friends.some((friendId) => friendId.equals(userId))) {
                throw new CustomError("Only friends can be added", 400);
            }
        }

        // Find and update the group if the user is the admin
        const updatedGroup = await Conversation.findOneAndUpdate(
            { _id: groupId, groupAdmin: userId, isGroup: true },
            { $addToSet: { users: { $each: members } } },
            { new: true }
        );

        if (!updatedGroup) {
            throw new CustomError("Group not found or unauthorized", 404);
        }

        await User.updateMany(
            { _id: { $in: members } },
            { $addToSet: { conversations: groupId } }
        );

        res.status(200).json({
            message: `${members.length > 1 ? "Members" : "Member"
                } added successfully!`,
            success: true,
            group: updatedGroup,
        });
    }
);

export const removeMembersFromGroup = asyncHandler(async (req: Request, res: Response) => {
        const userId = req?.user?.id;
        const { groupId } = req.params;
        const { members } = req.body;

        if (!userId) throw new CustomError("UserId not provided", 400);
        if (!groupId) throw new CustomError("Group ID not provided", 400);
        if (!Array.isArray(members) || members.length === 0) {
            throw new CustomError("Members array not provided or empty", 400);
        }

        // Find and update the group if the user is the admin
        const updatedGroup = await Conversation.findOneAndUpdate(
            { _id: groupId, groupAdmin: userId, isGroup: true },
            { $pull: { users: { $in: members } } },
            { new: true }
        );

        if (!updatedGroup) {
            throw new CustomError("Group not found or unauthorized", 404);
        }

        await User.updateMany(
            { _id: { $in: members } },
            { $pull: { conversation: groupId } }
        );

        res.status(200).json({
            message: "Members updated successfully!",
            success: true,
            group: updatedGroup,
        });
    }
);

export const fetchGroups = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new CustomError("UserId not provided", 400);
    }

    const groups = await Conversation.aggregate([
        {
            $match: {
                isGroup: true,
                users: new mongoose.Types.ObjectId(userId),
            },
        },
        {
            $lookup: {
                from: "messages",
                localField: "lastMessage",
                foreignField: "_id",
                as: "lastMessageData",
            },
        },
        {
            $addFields: {
                lastMessageCreatedAt: {
                    $arrayElemAt: ["$lastMessageData.createdAt", 0],
                },
                lastMessageSenderId: { $arrayElemAt: ["$lastMessageData.senderId", 0] },
                lastMessageText: { $arrayElemAt: ["$lastMessageData.text", 0] },
                lastMessageType: { $arrayElemAt: ["$lastMessageData.type", 0] },
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "lastMessageSenderId",
                foreignField: "_id",
                as: "lastMessageSender",
            },
        },
        {
            $sort: {
                lastMessageCreatedAt: -1, // Sort by last message timestamp
                createdAt: -1, // If no messages, sort by group creation
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "users",
                foreignField: "_id",
                as: "users",
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "groupAdmin",
                foreignField: "_id",
                as: "groupAdmin",
            },
        },
        {
            $addFields: {
                lastMessage: {
                    _id: { $arrayElemAt: ["$lastMessageData._id", 0] },
                    content: { $arrayElemAt: ["$lastMessageData.content", 0] },
                    type: { $arrayElemAt: ["$lastMessageData.type", 0] }, // Added type
                    text: { $arrayElemAt: ["$lastMessageData.text", 0] }, // Added text
                    createdAt: {
                        $dateToString: {
                            format: "%Y-%m-%d %H:%M:%S",
                            date: { $arrayElemAt: ["$lastMessageData.createdAt", 0] },
                        },
                    },
                    sender: {
                        _id: { $arrayElemAt: ["$lastMessageSender._id", 0] },
                        fullName: { $arrayElemAt: ["$lastMessageSender.fullName", 0] },
                        profilePic: { $arrayElemAt: ["$lastMessageSender.profilePic", 0] },
                    },
                },
            },
        },
        {
            $project: {
                _id: 1,
                groupName: 1,
                groupPic: 1,
                users: { _id: 1, fullName: 1, profilePic: 1 },
                groupAdmin: { _id: 1, fullName: 1, profilePic: 1 },
                lastMessage: 1,
                createdAt: 1,
            },
        },
    ]);

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const conversationIds = groups.map((d) => d._id);
    const unreadMessagesPerConversation = await Message.aggregate([
        {
            $match: {
                conversationId: { $in: conversationIds },
                senderId: { $ne: userObjectId },
                seenBy: { $nin: [userObjectId] },
            },
        },
        {
            $group: {
                _id: "$conversationId",
                count: { $sum: 1 },
            },
        },
    ]);

    const unreadMessagesMap = new Map(
        unreadMessagesPerConversation.map(({ _id, count }) => [
            _id.toString(),
            count,
        ])
    );

    // Merge unread messages count into chatData
    const newData = groups.map((chat) => ({
        ...chat,
        unreadMessages: unreadMessagesMap.get(chat._id.toString()) || 0,
    }));

    res.status(200).json({
        success: true,
        groups: newData,
    });
});

export const leaveGroup = asyncHandler(async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { groupId } = req.params;

    if (!userId) {
        throw new CustomError("User ID is required", 400);
    }

    const [group, user] = await Promise.all([
        Conversation.findById(groupId),
        User.findById(userId),
    ]);

    if (!group) throw new CustomError("Group not found", 404);
    if (!user) throw new CustomError("User not found", 404);

    const userObjectId = new mongoose.Types.ObjectId(userId);
    if (!group.users.some((id) => id.equals(userObjectId))) {
        throw new CustomError("User is not a member of the group", 400);
    }

    await Promise.all([
        Conversation.updateOne({ _id: groupId }, { $pull: { users: userId } }),
        User.updateOne({ _id: userId }, { $pull: { conversation: groupId } }),
    ]);

    res.status(200).json({ message: "User left the group", success: true });
});

