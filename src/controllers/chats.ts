import { Request, Response } from "express";
import asyncHandler from "../middlewares/tryCatch.js";
import { CustomError } from "../middlewares/errors/CustomError.js";
import User from "../models/user.js";
import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import mongoose from "mongoose";
import { generatePresignedUrl } from "../utils/s3.config.js";
import { BUCKET_NAME } from "../utils/envConfig.js";
import { getUniqueMediaName } from "../utils/utils.js";

const formatChatData = (conversations: any[], userId: string) => {
  return conversations.map((conversation) => {
    const otherUsers = conversation.users.filter(
      (user: any) => user._id.toString() !== userId
    );

    return {
      _id: conversation._id,
      isGroupChat: conversation.isGroupChat,
      chatName: conversation.isGroupChat
        ? conversation.chatName
        : otherUsers[0]?.fullName || "Unknown",
      profilePic: conversation.isGroupChat
        ? null
        : otherUsers[0]?.profilePic || "",
      lastMessage: conversation.lastMessage
        ? {
            text: conversation.lastMessage.text,
            type: conversation.lastMessage.type,
            createdAt: conversation.lastMessage.createdAt,
            sender: conversation.lastMessage.sender,
          }
        : null,
      users: conversation.users.map((user: any) => ({
        _id: user._id,
        fullName: user.fullName,
        profilePic: user.profilePic || "",
      })),
      groupAdmin: conversation.groupAdmin
        ? {
            _id: conversation.groupAdmin._id,
            fullName: conversation.groupAdmin.fullName,
            profilePic: conversation.groupAdmin.profilePic || "",
          }
        : null,
      createdAt: conversation.createdAt,
    };
  });
};

export const getallchats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req?.user?.id;
  const LIMIT = 10;

  if (!userId) throw new CustomError("UserId not provided", 400);

  const user = await User.findById(userId);
  if (!user) throw new CustomError("User not found", 404);

  const conversations = await Conversation.aggregate([
    {
      $match: { users: new mongoose.Types.ObjectId(userId) },
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
        lastMessageSenderId: {
          $arrayElemAt: ["$lastMessageData.senderId", 0],
        },
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
        lastMessageCreatedAt: -1, // Sort by last message date first
        createdAt: -1, // If no messages, sort by conversation creation
      },
    },
    { $limit: LIMIT },
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
        "lastMessage.sender": {
          _id: { $arrayElemAt: ["$lastMessageSender._id", 0] },
          fullName: { $arrayElemAt: ["$lastMessageSender.fullName", 0] },
        },
      },
    },
    {
      $project: {
        _id: 1,
        isGroupChat: 1,
        chatName: 1,
        profilePic: 1,
        users: { _id: 1, fullName: 1, profilePic: 1 },
        groupAdmin: { _id: 1, fullName: 1, profilePic: 1 },
        lastMessage: {
          $mergeObjects: [
            { $arrayElemAt: ["$lastMessageData", 0] },
            { sender: "$lastMessage.sender" },
          ],
        },
        createdAt: 1,
      },
    },
  ]);
  
  const chatData = formatChatData(conversations, userId);
  const conversationIds = conversations.map((d) => d._id);

  res.status(200).json({
    message: "Fetched recent chats",
    users: chatData,
    conversationIds,
    hasMore: conversations.length === LIMIT,
    success: true,
  });
});

export const getMoreChats = asyncHandler(async (req: Request, res: Response) => {
  const { conversationIds } = req.query;
  const userId = req?.user?.id;
  const LIMIT = 10;

  if (!userId) throw new CustomError("UserId not provided", 400);

  let conversationIdArray: string[] = [];

  if (typeof conversationIds === "string") {
    try {
      conversationIdArray = JSON.parse(conversationIds);
      if (!Array.isArray(conversationIdArray) || !conversationIdArray.every(id => typeof id === "string")) {
        throw new Error("Invalid conversationIds format");
      }
    } catch (error) {
      return res.status(400).json({ message: "Invalid conversationIds format" });
    }
  } else if (Array.isArray(conversationIds)) {
    conversationIdArray = conversationIds.map(id => String(id));
  }


  const moreChats = await Conversation.aggregate([
    {
      $match: {
        users: new mongoose.Types.ObjectId(userId),
        _id: { $nin: conversationIdArray.map(id => new mongoose.Types.ObjectId(id)) },
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
        lastMessageCreatedAt: { $arrayElemAt: ["$lastMessageData.createdAt", 0] },
        lastMessageSenderId: { $arrayElemAt: ["$lastMessageData.senderId", 0] },
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
        lastMessageCreatedAt: -1, 
        createdAt: -1, 
      },
    },
    { $limit: LIMIT },
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
        "lastMessage.sender": {
          _id: { $arrayElemAt: ["$lastMessageSender._id", 0] },
          fullName: { $arrayElemAt: ["$lastMessageSender.fullName", 0] },
        },
      },
    },
    {
      $project: {
        _id: 1,
        isGroupChat: 1,
        chatName: 1,
        profilePic: 1,
        users: { _id: 1, fullName: 1, profilePic: 1 },
        groupAdmin: { _id: 1, fullName: 1, profilePic: 1 },
        lastMessage: {
          $mergeObjects: [
            { $arrayElemAt: ["$lastMessageData", 0] },
            { sender: "$lastMessage.sender" },
          ],
        },
        createdAt: 1,
      },
    },
  ]);
  
  const newConversationIds = moreChats.map(chat => chat._id.toString());
  conversationIdArray = [...conversationIdArray, ...newConversationIds];

  // Check if more chats exist
  const remainingConversations = await Conversation.countDocuments({
    _id: { $nin: conversationIdArray.map(id => new mongoose.Types.ObjectId(id)) },
    users: new mongoose.Types.ObjectId(userId),
  });
  const hasMore = remainingConversations > 0;

  const chatData = formatChatData(moreChats, userId);

  res.status(200).json({
    message: "More chats fetched",
    success: true,
    hasMore,
    users: chatData,
    conversationIds: conversationIdArray, 
  });
});

const groupMessagesByDay = (messages: any) => {
  return messages.reduce((acc: any, message: any) => {
    // Format date as "DD/MM/YYYY"
    const date = new Date(message.createdAt);
    const dateKey = new Intl.DateTimeFormat("en-GB").format(date); // Output: "21/02/2025"

    acc[dateKey] = acc[dateKey] || [];
    acc[dateKey].push(message);

    return acc;
  }, {});
};

export const generatePresignedurl = asyncHandler(
  async (req: Request, res: Response) => {
    const { key, contentType } = req.body;

    const generateName = getUniqueMediaName(key);
    const actualKey = `chatsMedias/${generateName}`;

    const signedUrl = await generatePresignedUrl(
      BUCKET_NAME,
      actualKey,
      contentType
    );

    res.status(200).json({ signedUrl, key: actualKey });
  }
);

export const getOlderMessages = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { conversationId } = req.params;
    const { lastMessageId } = req.query;

    const LIMIT = 10;

    if (!userId) throw new CustomError("UserId not provided", 400);

    const user = await User.findById(userId);
    if (!user) throw new CustomError("User not found", 404);

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new CustomError("Conversation not found", 404);

    if (!conversation.users.includes(user._id)) {
      throw new CustomError("You are not a part of this conversation", 400);
    }

    // Build query for fetching older messages
    const query: any = { conversationId };
    if (lastMessageId) {
      const lastMessage = await Message.findById(lastMessageId);
      if (!lastMessage) throw new CustomError("Last message not found", 404);
      query.createdAt = { $lt: lastMessage.createdAt }; // Get messages older than lastMessageId
    }

    // Fetch messages in descending order (newest to oldest), then reverse for display
    const messages = await Message.find(query)
      .sort({ createdAt: -1 }) // Descending order to get the most recent ones first
      .limit(LIMIT)
      .populate("senderId", "fullName profilePic");

    // Reverse to display in chronological order
    const chronologicalMessages = messages.reverse();

    const hasMore =
    messages.length === LIMIT &&
    (await Message.exists({
      conversationId,
      createdAt: { $lt: messages[messages.length - 1].createdAt }, // Check if an older message exists
    })) !== null;
    
    // Group messages by date
    const messagesSent = groupMessagesByDay(chronologicalMessages);
    res.status(200).json({
      success: true,
      messages: messagesSent, // Group messages by date
      hasMore,
    });
  }
);

export const getPrivateChat = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { conversationId } = req.params;
    const LIMIT = 10;

    if (!userId) {
      throw new CustomError("UserId not provided", 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new CustomError("User not found", 404);
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new CustomError("Conversation not found", 404);
    }

    if (!conversation.users.includes(user._id)) {
      throw new CustomError("You are not a part of this conversation", 400);
    }

    // Get total message count
    const totalMessages = await Message.countDocuments({ conversationId });

    // Calculate how many messages to skip to show the most recent ones
    const skip = Math.max(0, totalMessages - LIMIT);

    // Fetch the most recent messages based on the LIMIT
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 }) // Sort in ascending order
      .skip(skip) // Skip older messages to get only the most recent ones
      .limit(LIMIT)
      .populate("senderId", "fullName profilePic");

    // Check if older messages exist (if we skipped any)
    const hasMore = skip > 0;

    // Group messages by date
    const groupedMessages = groupMessagesByDay(messages);

    // Build response object
    let conversationData: any = {
      conversationId: conversation._id,
      isGroup: conversation.isGroup,
      messages: groupedMessages,
      hasMore,
    };

    if (conversation.isGroup) {
      const groupUsers = await User.find({
        _id: { $in: conversation.users, $nin: [conversation.groupAdmin] },
      }).select("fullName profilePic");

      const groupAdmin = await User.findById(conversation.groupAdmin).select(
        "fullName profilePic"
      );

      conversationData.groupUsers = groupAdmin
        ? [...groupUsers, { ...groupAdmin.toObject(), isAdmin: true }]
        : groupUsers;
      conversationData.groupName = conversation.groupName;
    } else {
      const otherUser = conversation.users.find(
        (id: mongoose.Types.ObjectId) => id.toString() !== user._id.toString()
      );
      const otherUserData = await User.findById(otherUser).select(
        "fullName profilePic"
      );
      conversationData.otherUser = otherUserData;
    }

    res.status(200).json({
      message: conversation.isGroup ? "Get group chat" : "Get private chat",
      success: true,
      conversation: conversationData,
    });
  }
);
