
export interface User {
    id: string;
    email: string;
    fullName: string;
    userName: string;
    profilePic: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: User; 
        }
    }
}
