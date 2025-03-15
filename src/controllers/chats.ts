import { Request, Response } from "express";
import asyncHandler from "../middlewares/tryCatch.js";
import { CustomError } from "../middlewares/errors/CustomError.js";
import User from "../models/user.js";
import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import mongoose from "mongoose";
import {
  generateDownloadUrl,
  generatePresignedUrl,
} from "../utils/s3.config.js";
import { BUCKET_NAME } from "../utils/envConfig.js";
import { getUniqueMediaName } from "../utils/utils.js";

const formatChatData = (conversations: any[], userId: string) => {
  return conversations.map((conversation) => {
    const otherUsers = conversation.users.filter(
      (user: any) => user._id.toString() !== userId
    );
    return {
      _id: conversation._id,
      isGroup: conversation.isGroup,
      chatName: conversation.isGroup
        ? conversation.groupName
        : otherUsers[0]?.fullName || "Unknown",
      profilePic: conversation.isGroup
        ? conversation.groupPic
        : otherUsers[0]?.profilePic || "",
      lastMessage: conversation.lastMessage
        ? {
          text: conversation.lastMessage.text,
          type: conversation.lastMessage.type,
          createdAt: conversation.lastMessage.createdAt,
          sender: conversation.lastMessage.sender,
          status: conversation.lastMessage.status,
          mesId: conversation.lastMessage.mesId,
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
        let: { conversationId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$conversationId", "$$conversationId"] } } },
          { $sort: { createdAt: -1 } },
          {
            $match: {
              deletedfor: { $ne: new mongoose.Types.ObjectId(userId) }
            }
          },
          { $limit: 1 },
        ],
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
        "lastMessage.status": { $arrayElemAt: ["$lastMessageData.status", 0] },
        "lastMessage.mesId": { $arrayElemAt: ["$lastMessageData.mesId", 0] },
      },
    },
    {
      $project: {
        _id: 1,
        chatName: 1,
        isGroup: 1,
        groupName: 1,
        groupPic: 1,
        profilePic: 1,
        users: { _id: 1, fullName: 1, profilePic: 1 },
        groupAdmin: { _id: 1, fullName: 1, profilePic: 1 },
        lastMessage: {
          $mergeObjects: [
            { $arrayElemAt: ["$lastMessageData", 0] },
            { sender: "$lastMessage.sender" },
            { status: "$lastMessage.status" },
            { mesId: "$lastMessage.mesId" },
          ],
        },
        createdAt: 1,
      },
    },
  ]);


  const chatData = formatChatData(conversations, userId);
  const conversationIds = conversations.map((d) => d._id);

  // Optimize unread message counting using aggregation instead of looping over each conversation

  const userObjectId = new mongoose.Types.ObjectId(userId); // Ensure ObjectId

  const unreadMessagesPerConversation = await Message.aggregate([
    {
      $match: {
        conversationId: { $in: conversationIds },
        senderId: { $ne: userObjectId }, // Exclude sender's own messages
        seenBy: { $nin: [userObjectId] }, // Ensure user is NOT in seenBy
      },
    },
    {
      $group: {
        _id: "$conversationId",
        count: { $sum: 1 },
      },
    },
  ]);

  // Convert unread messages to a map for quick lookup
  const unreadMessagesMap = new Map(
    unreadMessagesPerConversation.map(({ _id, count }) => [_id.toString(), count])
  );

  // Merge unread messages count into chatData
  const newData = chatData.map((chat) => ({
    ...chat,
    unreadMessages: unreadMessagesMap.get(chat._id.toString()) || 0,
  }));

  res.status(200).json({
    message: "Fetched recent chats",
    users: newData,
    conversationIds,
    hasMore: conversations.length === LIMIT,
    success: true,
  });
});

export const getMoreChats = asyncHandler(
  async (req: Request, res: Response) => {
    const { conversationIds } = req.query;
    const userId = req?.user?.id;
    const LIMIT = 10;

    if (!userId) throw new CustomError("UserId not provided", 400);

    let conversationIdArray: string[] = [];

    if (typeof conversationIds === "string") {
      try {
        conversationIdArray = JSON.parse(conversationIds);
        if (!Array.isArray(conversationIdArray) || !conversationIdArray.every((id) => typeof id === "string")) {
          throw new Error("Invalid conversationIds format");
        }
      } catch (error) {
        return res.status(400).json({ message: "Invalid conversationIds format" });
      }
    } else if (Array.isArray(conversationIds)) {
      conversationIdArray = conversationIds.map((id) => String(id));
    }

    const moreChats = await Conversation.aggregate([
      {
        $match: {
          users: new mongoose.Types.ObjectId(userId),
          _id: {
            $nin: conversationIdArray.map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      },
      {
        $lookup: {
          from: "messages",
          let: { lastMessageId: "$lastMessage", userId: new mongoose.Types.ObjectId(userId) },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$lastMessageId"],
                },
              },
            },
            {
              $match: {
                deletedfor: { $not: { $in: [new mongoose.Types.ObjectId(userId)] } },
              },
            },
            {
              $sort: { createdAt: -1 },
            },
            {
              $limit: 1,
            },
          ],
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
        $sort: { lastMessageCreatedAt: -1, createdAt: -1 },
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
          "lastMessage.status": { $arrayElemAt: ["$lastMessageData.status", 0] },
          "lastMessage.mesId": { $arrayElemAt: ["$lastMessageData.mesId", 0] },
        },
      },
      {
        $project: {
          _id: 1,
          chatName: 1,
          profilePic: 1,
          isGroup: 1,
          groupName: 1,
          groupPic: 1,
          users: { _id: 1, fullName: 1, profilePic: 1 },
          groupAdmin: { _id: 1, fullName: 1, profilePic: 1 },
          lastMessage: {
            $mergeObjects: [
              { $arrayElemAt: ["$lastMessageData", 0] },
              { sender: "$lastMessage.sender" },
              { status: "$lastMessage.status" },
              { mesId: "$lastMessage.mesId" },
            ],
          },
          createdAt: 1,
        },
      },
    ]);


    if (!Array.isArray(moreChats)) {
      return res.status(500).json({ message: "Unexpected response format" });
    }

    const newConversationIds = moreChats.map((chat) => chat._id.toString());
    conversationIdArray = [...conversationIdArray, ...newConversationIds];

    // Check if more chats exist
    const remainingConversations = await Conversation.countDocuments({
      _id: { $nin: conversationIdArray.map((id) => new mongoose.Types.ObjectId(id)) },
      users: new mongoose.Types.ObjectId(userId),
    });

    const hasMore = remainingConversations > 0;

    const chatData = formatChatData(moreChats, userId);

    // Fetch unread messages for all conversations in parallel
    const unreadMessagesPerConversation = await Promise.all(
      moreChats.map(async (conversation) => {
        const count = await Message.countDocuments({ conversationId: conversation._id, seenBy: { $not: { $in: [userId] } } });
        return { count, conversationId: conversation._id.toString() };
      })
    );

    const newData = chatData.map((chat) => {
      const unreadMessages = unreadMessagesPerConversation.find(
        (message) => message.conversationId === chat._id.toString()
      );
      return {
        ...chat,
        unreadMessages: unreadMessages ? unreadMessages.count : 0,
      };
    });

    res.status(200).json({
      message: "More chats fetched",
      success: true,
      hasMore,
      users: newData,
      conversationIds: conversationIdArray,
    });
  }
);

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

export const getDownloadUrl = asyncHandler(
  async (req: Request, res: Response) => {
    const { url } = req.body;

    if (!url) throw new CustomError("Url not provided", 400);

    const fileName = url.split(".net/").pop();

    const signedUrl = await generateDownloadUrl(BUCKET_NAME, fileName);
    res.status(200).json({ url: signedUrl });
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
    const query: any = { conversationId, deletedfor: { $ne: userId } };
    if (lastMessageId) {
      const lastMessage = await Message.findById(lastMessageId);
      if (!lastMessage) throw new CustomError("Last message not found", 404);
      query.createdAt = { $lt: lastMessage.createdAt };// Get messages older than lastMessageId
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

    const ObjectIdConversationId = new mongoose.Types.ObjectId(conversationId)

    const isBlockedByYou = user.blockedConversations.includes(ObjectIdConversationId);

    let isBlockedByUser = false;
    if (!conversation.isGroup) {
      const otherUserId = conversation.users.find(
        (id: mongoose.Types.ObjectId) => id.toString() !== user._id.toString()
      );

      if (otherUserId) {
        const otherUser = await User.findById(otherUserId);
        isBlockedByUser = otherUser?.blockedConversations.includes(ObjectIdConversationId) || false;
      }
    }

    // Get total message count
    const totalMessages = await Message.countDocuments({ conversationId });

    // Calculate how many messages to skip to show the most recent ones
    const skip = Math.max(0, totalMessages - LIMIT);

    // Fetch the most recent messages based on the LIMIT
    const messages = await Message.find({ conversationId, deletedfor: { $ne: userId } })
      .sort({ createdAt: 1 })// Sort in ascending order

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
      isBlockedByYou,
      isBlockedByUser,
    };

    if (conversation.isGroup) {
      const groupUsers = await User.find({
        _id: { $in: conversation.users, $nin: [conversation.groupAdmin] },
      }).select("fullName profilePic userName");

      const groupAdmin = await User.findById(conversation.groupAdmin).select(
        "fullName profilePic userName"
      );

      conversationData.groupUsers = groupAdmin
        ? [{ ...groupAdmin.toObject(), isAdmin: true },...groupUsers]
        : groupUsers;
      conversationData.groupName = conversation.groupName;
      conversationData.groupDescription = conversation.groupDescription;
      conversationData.groupAdmin = conversation.groupAdmin;
      conversationData.groupPic = conversation.groupPic;
    } else {
      const otherUser = conversation.users.find(
        (id: mongoose.Types.ObjectId) => id.toString() !== user._id.toString()
      );
      const otherUserData = await User.findById(otherUser).select(
        "fullName profilePic"
      );
      conversationData.otherUser = otherUserData;
    }
    conversationData.createdAt = conversation.createdAt;

    res.status(200).json({
      message: conversation.isGroup ? "Get group chat" : "Get private chat",
      success: true,
      conversation: conversationData,
    });
  }
);


/**
 * Search for conversations (private and group) for a specific user
 * @param {ObjectId} userId - The ID of the current user
 * @param {string} query - The search query
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<Array>} - Array of matching conversations
 */
const searchConversations = async (userObjectId : mongoose.Types.ObjectId, query: string) => {
  const conversations = await Conversation.aggregate([
    // Lookup users to get fullName
    {
      $lookup: {
        from: "users",
        localField: "users",
        foreignField: "_id",
        as: "usersData",
      },
    },
    
    // First match to filter only conversations the user is part of
    {
      $match: {
        users: userObjectId
      },
    },
    
    // Add a field to determine if it's a group or private chat
    {
      $addFields: {
        otherUsers: {
          $filter: {
            input: "$usersData",
            as: "user",
            cond: { $ne: ["$$user._id", userObjectId] }
          }
        }
      }
    },
    
    // Match the search query pattern
    {
      $match: {
        $or: [
          // Search in group name (for group chats)
          { 
            isGroup: true,
            groupName: { $regex: query, $options: "i" } 
          },
          // Search in other users' names (for private chats)
          {
            isGroup: false,
            "otherUsers.fullName": { $regex: query, $options: "i" }
          },
          // Also search in group description
          {
            isGroup: true,
            groupDescription: { $regex: query, $options: "i" }
          }
        ],
      },
    },
    
    // Lookup last message details
    {
      $lookup: {
        from: "messages",
        let: { conversationId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$conversationId", "$$conversationId"] } } },
          { $sort: { createdAt: -1 } },
          {
            $match: {
              deletedfor: { $ne: userObjectId },
            },
          },
          { $limit: 1 },
        ],
        as: "lastMessageData",
      },
    },
    
    // Add fields for last message details
    {
      $addFields: {
        lastMessageCreatedAt: { $arrayElemAt: ["$lastMessageData.createdAt", 0] },
        lastMessageSenderId: { $arrayElemAt: ["$lastMessageData.senderId", 0] },
      },
    },
    
    // Lookup last message sender
    {
      $lookup: {
        from: "users",
        localField: "lastMessageSenderId",
        foreignField: "_id",
        as: "lastMessageSender",
      },
    },
    
    // Sorting conversations based on latest message
    {
      $sort: {
        lastMessageCreatedAt: -1,
        createdAt: -1,
      },
    },
    
    
    // Lookup group admin details
    {
      $lookup: {
        from: "users",
        localField: "groupAdmin",
        foreignField: "_id",
        as: "groupAdmin",
      },
    },
    
    // Format last message details
    {
      $addFields: {
        chatName: {
          $cond: {
            if: "$isGroup",
            then: "$groupName",
            else: { $arrayElemAt: ["$otherUsers.fullName", 0] }
          }
        },
        profilePic: {
          $cond: {
            if: "$isGroup",
            then: "$groupPic",
            else: { $arrayElemAt: ["$otherUsers.profilePic", 0] }
          }
        },
        "lastMessage.sender": {
          _id: { $arrayElemAt: ["$lastMessageSender._id", 0] },
          fullName: { $arrayElemAt: ["$lastMessageSender.fullName", 0] },
        },
        "lastMessage.status": { $arrayElemAt: ["$lastMessageData.status", 0] },
        "lastMessage.mesId": { $arrayElemAt: ["$lastMessageData.mesId", 0] },
        "lastMessage.type": { $arrayElemAt: ["$lastMessageData.type", 0] },
        "lastMessage.text": { $arrayElemAt: ["$lastMessageData.text", 0] },
        "lastMessage.createdAt": { $arrayElemAt: ["$lastMessageData.createdAt", 0] },
      },
    },
    
    // Final projection to select required fields
    {
      $project: {
        _id: 1,
        chatName: 1,
        isGroup: 1,
        groupName: 1,
        groupPic: 1,
        profilePic: 1,
        groupDescription: 1,
        users: "$otherUsers",
        groupAdmin: { 
          $cond: {
            if: { $eq: [{ $size: "$groupAdmin" }, 0] },
            then: null,
            else: {
              _id: { $arrayElemAt: ["$groupAdmin._id", 0] },
              fullName: { $arrayElemAt: ["$groupAdmin.fullName", 0] },
              profilePic: { $arrayElemAt: ["$groupAdmin.profilePic", 0] }
            }
          }
        },
        lastMessage: 1,
        createdAt: 1,
      },
    },
  ]);
  
  return conversations || [];
};

export const getChatsByQuery = asyncHandler(async (req: Request, res: Response) => {
  const userId = req?.user?.id;
  const { query } = req.query;
  const LIMIT = 10;

  if (!userId) throw new CustomError("UserId not provided", 400);
  if (!query) throw new CustomError("Search query is required", 400);

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const conversations =await searchConversations(userObjectId,query as string);
  const chatData = formatChatData(conversations, userId);
  const conversationIds = conversations.map((d:any) => d._id);

  const unreadMessagesPerConversation = await Message.aggregate([
    {
      $match: {
        conversationId: { $in: conversationIds },
        senderId: { $ne: userObjectId }, // Exclude sender's own messages
        seenBy: { $nin: [userObjectId] }, // Ensure user is NOT in seenBy
      },
    },
    {
      $group: {
        _id: "$conversationId",
        count: { $sum: 1 },
      },
    },
  ]);

  // Convert unread messages to a map for quick lookup
  const unreadMessagesMap = new Map(
    unreadMessagesPerConversation.map(({ _id, count }) => [_id.toString(), count])
  );

  // Merge unread messages count into chatData
  const newData = chatData.map((chat) => ({
    ...chat,
    unreadMessages: unreadMessagesMap.get(chat._id.toString()) || 0,
  }));

  res.status(200).json({
    message: "Fetched search results",
    users: newData,
    conversationIds,
    hasMore: conversations.length === LIMIT,
    success: true,
  });
});

const deleteAllMessages = async () => {
  try {
    await Message.deleteMany({});

    await Conversation.updateMany({}, {
      $set: { lastMessage: null, messages: [] }
    });

    console.log("All messages deleted and conversations updated.");
  } catch (error) {
    console.error("Error deleting messages:", error);
  }
};

// deleteAllMessages()