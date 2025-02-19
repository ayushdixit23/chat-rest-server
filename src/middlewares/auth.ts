import { Request, Response, NextFunction } from "express";
import asyncHandler from "./tryCatch.js";
import { CustomError } from "./errors/CustomError.js";
import { verifyToken } from "../utils/jwt.js";

export const verifyUserToken = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            throw new CustomError("Unauthorized: No token provided", 401);
        }
        const decoded = verifyToken(token);

        if (!decoded) {
            throw new CustomError("Unauthorized: Invalid or expired token", 401);
        }

        req.user = decoded;
        next();
    }
);
