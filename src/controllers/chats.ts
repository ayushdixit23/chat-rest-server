import { Request, Response } from "express";
import asyncHandler from "../middlewares/tryCatch.js";
import { CustomError } from "../middlewares/errors/CustomError.js";
import User from "../models/user.js";
import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import mongoose from "mongoose";
import { faker } from "@faker-js/faker";

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
        conversationData.groupUsers = groupUsers;
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

const generateFakeUser = async () => {
  // Only assign a googleId if the user is a Google user
  const user = new User({
    fullName: faker.person.fullName(),
    userName: `${faker.person.firstName()}${faker.person.lastName()}`,
    profilePic: faker.image.avatar(),
    email: faker.internet.email(),
    password: "$2b$10$33AH7gY4MkBL3qL2rPfjSezom5M4CzTBlQcokA6ZOjnrnQUG/Hpr6",
    isGoogleUser: false,
    googleId: null, // Only use null if not a Google user
    bio: faker.lorem.sentence(),
    friends: [],
    sentFriendRequests: [],
    conversation: [],
  });
  return user;
};



const generateFakeUsers = async (count: number) => {
  const userIds = ["67b5b7740b5b09c8ede19f8d", "67b5b7d70b5b09c8ede19f93"]; // Friend IDs
  const friends = await User.find({ _id: { $in: userIds } }); // Fetch friends once

  if (friends.length !== userIds.length) {
    throw new Error("Some friend(s) not found");
  }

  for (let i = 0; i < count; i++) {
    const fakeUser = await generateFakeUser(); // Generate fake user

    const user = await fakeUser.save(); // Save user to database

    // Create conversations with friends
    const conversationPromises = friends.map(async (friend) => {
      const conversation = new Conversation({
        users: [user._id, friend._id],
      });

      const savedConversation = await conversation.save(); // Save conversation first

      // Add the conversation to the user and friend (we will save them later in one go)
      user.conversation.push(savedConversation._id);
      friend.conversation.push(savedConversation._id);

      // Also add user as a friend
      if (!friend.friends.includes(user._id)) {
        friend.friends.push(user._id); // Add the new user to the friend
      }

      return savedConversation._id; // Return conversation ID for later use
    });

    // Wait for all conversations to be created and saved
    const conversationIds = await Promise.all(conversationPromises);

    // Add the generated conversations to the user’s conversation array
    user.conversation.push(...conversationIds);

    // Save user and friends after all changes are made
    await user.save();
    await Promise.all(friends.map((friend) => friend.save())); // Save all friends

    console.log(`User ${i + 1} saved!`);
  }

  console.log("All users generated successfully!");
};

// Call generateFakeUsers to create 10 fake users

// generateFakeUsers(20);
