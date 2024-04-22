"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const mux_node_1 = __importDefault(require("@mux/mux-node"));
const storage_1 = require("firebase-functions/v2/storage");
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const storage_2 = require("firebase-admin/storage");
const logger = __importStar(require("firebase-functions/logger"));
const eventarc_1 = require("firebase-admin/eventarc");
const eventarc_2 = require("firebase-functions/v2/eventarc");
const dotenv = __importStar(require("dotenv"));
(0, app_1.initializeApp)();
const db_1 = require("./db/db");
dotenv.config();
const { Video } = new mux_node_1.default((_a = process.env.MUX_TOKEN_ID) !== null && _a !== void 0 ? _a : "", (_b = process.env.MUX_TOKEN_SECRET) !== null && _b !== void 0 ? _b : "");
exports.uploadVideo = (0, storage_1.onObjectFinalized)({}, async (event) => {
    const fileBucket = event.data.bucket; // Storage bucket containing the file.
    const filePath = event.data.name; // File path in the bucket.
    // const contentType = event.data.contentType; // File content type.
    if (!filePath.startsWith("dances/")) {
        return;
    }
    const bucket = (0, storage_2.getStorage)().bucket(fileBucket);
    const file = bucket.file(filePath);
    const signedURLConfig = {
        action: "read",
        expires: "08-12-2030",
    }; // For example...
    const signedURLArray = await file.getSignedUrl(signedURLConfig);
    const url = signedURLArray[0];
    const asset = await Video.Assets.create({
        "input": url,
        "playback_policy": [
            "public", // makes playback ID available on the asset
        ],
        "mp4_support": "standard",
    });
    await db_1.db.danceVideos.doc(asset.id).set({
        videoUrl: "",
        thumbnailUrl: "",
        frameDataUrl: "",
        status: "upload",
    });
    return logger.log(asset);
});
exports.handleMuxWebhook = (0, https_1.onRequest)(async (req, res) => {
    const { type: eventType, data: eventData, object: object } = await req.body;
    const qualityWeights = { "low.mp4": 0, "medium.mp4": 1, "high.mp4": 2 };
    switch (eventType) {
        case "video.asset.static_renditions.ready": {
            const rendition = eventData.static_renditions.files.reduce((prev, current) => {
                if (qualityWeights[prev.name] > qualityWeights[current.name]) {
                    return prev;
                }
                return current;
            }); // returns object
            logger.log(object.id, eventData.static_renditions.status, rendition.name, rendition.width, rendition.height, eventData.playback_ids[0].id);
            const muxRendition = {
                id: object.id,
                width: rendition.width,
                height: rendition.height,
                playbackId: eventData.playback_ids[0].id,
                fileName: rendition.name,
            };
            await (0, eventarc_1.getEventarc)().channel().publish({
                type: "static_rendition_available",
                subject: "A static rendition is now available",
                data: muxRendition,
            });
            break;
        }
        default:
            // Mux sends webhooks for *lots* of things, but we'll ignore those for now
            logger.log("some other event!", eventType, eventData);
    }
    res.status(200).send("");
});
exports.poseDetectionFromStaticRendition = (0, eventarc_2.onCustomEventPublished)("static_rendition_available", async (event) => {
    logger.log(event.type, event.subject, event.data);
    const videoUrl = `https://stream.mux.com/${event.data.playbackId}/${event.data.fileName}`;
    const thumbnailUrl = `https://image.mux.com/${event.data.playbackId}/thumbnail.jpg`;
    const resp = await fetch("https://mediapipe-cloud-run-2vs2w65rla-uc.a.run.app", {
        method: "POST",
        body: JSON.stringify({ video_url: videoUrl }),
        headers: {
            "Content-type": "application/json; charset=UTF-8",
        },
    });
    const trackingData = await resp.json();
    const bucket = (0, storage_2.getStorage)().bucket("danceduel.appspot.com");
    // Upload the thumbnail.
    const metadata = { contentType: "application/json" };
    await bucket.file(`pose_data/${event.data.id}.json`)
        .save(JSON.stringify(trackingData), {
        metadata: metadata,
    });
    await db_1.db.danceVideos.doc(event.data.id).set({
        videoUrl: videoUrl,
        thumbnailUrl: thumbnailUrl,
        frameDataUrl: `pose_data/${event.data.id}.json`,
        status: "ready",
    });
    logger.log("Complete");
});
//# sourceMappingURL=index.js.map