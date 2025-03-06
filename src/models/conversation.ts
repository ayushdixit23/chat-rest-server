import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
    {
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        isGroup: { type: Boolean, default: false },
        groupAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        groupName: { type: String },
        groupPic: { type: String },
        groupDescription: { type: String, default: "Hey there, i am using Lets chat!" },
        lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
        messages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
    },
    { timestamps: true }
);

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
