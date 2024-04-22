"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const firestore_1 = require("firebase-admin/firestore");
// Import or define your types
// import { YourType } from '~/@types'
const converter = () => ({
    toFirestore: (data) => data,
    fromFirestore: (snap) => snap.data(),
});
const dataPoint = (collectionPath) => (0, firestore_1.getFirestore)().collection(collectionPath).withConverter(converter());
exports.db = {
    // list your collections here
    danceVideos: dataPoint("dance_video"),
};
//# sourceMappingURL=db.js.map