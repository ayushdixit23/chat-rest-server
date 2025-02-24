import { v4 as uuid } from "uuid";

export const getUniqueMediaName = (fileName: string) => {
    const uuidString = uuid();
    return `${Date.now()}_${uuidString}_${fileName}`;
}