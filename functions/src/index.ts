"use strict";

import * as express from "express";
import Mux, {StaticRendition} from "@mux/mux-node";
import {CloudEvent} from "firebase-functions/lib/v2";
import {onRequest, Request} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {getStorage} from "firebase-admin/storage";
import {GetSignedUrlConfig} from "@google-cloud/storage";
import * as logger from "firebase-functions/logger";
import {getEventarc} from "firebase-admin/eventarc";
import {onCustomEventPublished} from "firebase-functions/v2/eventarc";
import * as dotenv from "dotenv";
import {defineString} from "firebase-functions/params";
import * as functions from "firebase-functions";

const MUX_TOKEN_ID = defineString("MUX_TOKEN_ID");
const MUX_TOKEN_SECRET = defineString("MUX_TOKEN_SECRET");
const MEDIAPIPE_SERVICE = defineString("MEDIAPIPE_SERVICE");
const POSE_DATA_BUCKET = defineString("POSE_DATA_BUCKET");

initializeApp();

import {db} from "./db/db";
import {ObjectMetadata} from "firebase-functions/v1/storage";

dotenv.config();

/**
 * Get current date and time
 * @return {string} a string date and time
 */
function getDateTimeForNow():string {
  const now = new Date();
  const localeDatetimeString = now.toLocaleString();

  return localeDatetimeString;
}

exports.uploadVideo = functions.storage.object().onFinalize(
  async (object:ObjectMetadata) => {
    const {Video} = new Mux(
      MUX_TOKEN_ID.value() ?? "",
      MUX_TOKEN_SECRET.value() ?? ""
    );
    const fileBucket = object.bucket; // Storage bucket containing the file.
    const filePath = object.name; // File path in the bucket.
    // const contentType = event.data.contentType; // File content type.

    if (!filePath || !filePath.startsWith("dances/")) {
      return;
    }

    const bucket = getStorage().bucket(fileBucket);
    const file = bucket.file(filePath);

    const signedURLConfig : GetSignedUrlConfig = {
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

    await db.danceVideos.doc(asset.id).set({
      videoUrl: "",
      thumbnailUrl: "",
      frameDataUrl: "",
      status: "upload",
      sourcelVideo: filePath,
      createdDateTime: getDateTimeForNow(),
    });

    return logger.log(asset);
  });

exports.handleMuxWebhook = onRequest(
  async (req: Request, res: express.Response) => {
    const {type: eventType, data: eventData, object: object} = await req.body;

    const qualityWeights = {"low.mp4": 0, "medium.mp4": 1, "high.mp4": 2};

    switch (eventType) {
    case "video.asset.static_renditions.ready": {
      const rendition = eventData.static_renditions.files.reduce(
        (prev: StaticRendition, current: StaticRendition) => {
          if (qualityWeights[prev.name] > qualityWeights[current.name]) {
            return prev;
          }
          return current;
        }); // returns object
      logger.log(
        object.id,
        eventData.static_renditions.status,
        rendition.name,
        rendition.width,
        rendition.height,
        eventData.playback_ids[0].id
      );
      const muxRendition: MuxStaticRendition = {
        id: object.id,
        width: rendition.width,
        height: rendition.height,
        playbackId: eventData.playback_ids[0].id,
        fileName: rendition.name,
      };
      await getEventarc().channel().publish({
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

exports.poseDetectionFromStaticRendition = onCustomEventPublished(
  {
    eventType: "static_rendition_available",
    region: "us-central1",
  },
  async (event: CloudEvent<MuxStaticRendition>) => {
    logger.log(event.type, event.subject, event.data);
    const videoUrl = `https://stream.mux.com/${event.data.playbackId}/${event.data.fileName}`;
    const thumbnailUrl = `https://image.mux.com/${event.data.playbackId}/thumbnail.jpg`;

    let resp;
    try {
      // fetch pose dataa from mediapipe service. Exp: https://mediapipe-cloud-run-uqnbbgbvta-uc.a.run.app
      resp = await fetch(MEDIAPIPE_SERVICE.value(), {
        method: "POST",
        body: JSON.stringify({video_url: videoUrl}),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
        },
      });
    } catch (error) {
      logger.error("ERROR: cannot generate pose data for video: " + videoUrl, error);
      logger.log("Incomplete: " + videoUrl);
      return;
    }

    const trackingData : PoseDetection = await resp.json();

    const bucket = getStorage().bucket(POSE_DATA_BUCKET.value()); // pose data bucket. Exp: dev-danceduel.appspot.com

    // Upload the thumbnail.
    const metadata = {contentType: "application/json"};
    await bucket.file(`pose_data/${event.data.id}.json`)
      .save(JSON.stringify(trackingData), {
        metadata: metadata,
      });

    await db.danceVideos.doc(event.data.id).update({
      videoUrl: videoUrl,
      thumbnailUrl: thumbnailUrl,
      frameDataUrl: `pose_data/${event.data.id}.json`,
      status: "ready",
      updatedDateTime: getDateTimeForNow(),
    });

    logger.log("Complete: " + videoUrl);
  });

interface PoseDetection {
    frame_rate: number;
    size: [width: number, height: number];
    frames: [PoseDetectionFrame];
}

interface PoseDetectionFrame {
    timestamp: number;
    pose: [[x: number, y: number, z: number, visibility: number]];
    frames: string;
}
interface MuxStaticRendition {
    id: string;
    width: string;
    height: string;
    playbackId: string
    fileName: string;
}
