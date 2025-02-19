import { Request, Response } from "express";
import asyncHandler from "../middlewares/tryCatch.js";
import { CustomError } from "../middlewares/errors/CustomError.js";
import User from "../models/user.js";
import FriendRequest from "../models/friendrequest.js";

export const createFriendRequest = asyncHandler(async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { friendId } = req.params;

    if (!userId) {
        throw new CustomError("UserId not provided", 400);
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new CustomError("User not found", 404);
    }

    // Check if the users are already friends
    // @ts-ignore
    if (user.friends.includes(friendId)) {
        throw new CustomError("User is already a friend", 400);
    }

    // Check if a friend request has already been sent
    const existingRequest = await FriendRequest.findOne({
        sentBy: userId,
        isSentTo: friendId,
        status: "pending",
    });

    if (existingRequest) {
        throw new CustomError("Friend request already sent", 400);
    }

    // Create the friend request
    const friendRequest = new FriendRequest({
        sentBy: userId,
        isSentTo: friendId,
        status: "pending",
    });

    await friendRequest.save();

    // Add the friendId to the sentFriendRequests
    // @ts-ignore
    user.sentFriendRequests.push(friendId);
    await user.save();

    res.status(200).json({ success: true, message: "Friend request created!" });
});

export const respondFriendRequest = asyncHandler(async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { action }: { action: "accepted" | "rejected" } = req.body;
    const { friendRequestId } = req.params;

    if (!userId) {
        throw new CustomError("UserId not provided", 400);
    }

    // Fetch the friend request and user at the same time
    const friendRequest = await FriendRequest.findById(friendRequestId);

    if (!friendRequest) {
        throw new CustomError("Friend request not found", 404);
    }

    // Update the status of the friend request
    friendRequest.status = action;
    await friendRequest.save();

    if (action === "accepted") {
        const friendUserId = friendRequest?.sentBy;

        // Fetch both users in a single query to reduce database calls
        const [user, friendUser] = await Promise.all([
            User.findById(userId),
            User.findById(friendUserId)
        ]);

        if (!user) {
            throw new CustomError("User not found", 404);
        }

        if (!friendUser) {
            throw new CustomError("Friend user not found", 404);
        }

        // Add both users to each other's friends list
        user.friends.push(friendUserId);
        friendUser.friends.push(user._id);

        await Promise.all([user.save(), friendUser.save()]);
    }

    res.status(200).json({ success: true, message: `Friend request ${action}` });
});

export const getallchats = asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ message: "Get all chats" });
});

export const getUserSuggestion = asyncHandler(async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    if (!userId) {
        throw new CustomError("UserId not provided", 400);
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new CustomError("User not found", 404);
    }

    const suggestedUsers = await User.find({
        $and: [
            { _id: { $ne: userId } },
            { _id: { $nin: [...(user.sentFriendRequests || []), ...(user.friends || [])] } }
        ],
    }).limit(5).select("-password");

    res.status(200).json({ success: true, users: suggestedUsers });
});