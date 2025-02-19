import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
    {
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        lastMessage: {
            message: { type: String },
            createdAt: { type: Date }
        },
        messages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
    },
    { timestamps: true }
);

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
