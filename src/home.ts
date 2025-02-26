import { Scene } from "./AR/Scene";
import { displayLandmarks } from "./lib/display";
import { hasGetUserMedia } from "./lib/utils";
import "./main.css";

import {
  FilesetResolver,
  GestureRecognizer,
  GestureRecognizerResult,
} from "@mediapipe/tasks-vision";
import * as THREE from "three";

// declare variables
declare type RunningMode = "IMAGE" | "VIDEO";
let runningMode: RunningMode = "VIDEO";
let gestureRecognizer: GestureRecognizer | undefined;
let isWebcamRunning: boolean = false;
let lastVideoTime = -1;
let results: GestureRecognizerResult | undefined = undefined;

let SCENE: Scene;
let thumbsUpStartTime: number | null = null;

// declare DOM elements
const video = document.querySelector("#webcam") as HTMLVideoElement;
const canvasElement = document.querySelector(
  "#output_canvas"
) as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const gestureOutput = document.querySelector(
  "#gesture_output"
) as HTMLDivElement;
const btnEnableWebcam = document.querySelector(
  "#webcamButton"
) as HTMLButtonElement;
const ARLayers = document.querySelector("#ar-layers") as HTMLElement;

const nextPageText = document.querySelector("#nextPage");

init();

async function init() {
  try {
    await hasGetUserMedia();
    console.log("User media available");

    await createGestureRecognizer();
    console.log("Gesture recognizer created");

    await enableWebcam();
    console.log("Webcam enabled");

    await createScene();
    console.log("Scene created");

    await predictWebcam();
  } catch (e) {
    console.error(e);
  }
}

async function createScene() {
  SCENE = new Scene(video.videoWidth, video.videoHeight, ARLayers);
}

async function createGestureRecognizer() {
  // Load the MediaPipe gesture recognizer
  // It is a web assembly file, so we need to load it using the FilesetResolver
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
    numHands: 2,
    runningMode: runningMode,
    baseOptions: {
      delegate: "GPU",
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
    },
  });
}

async function enableWebcam() {
  isWebcamRunning = !isWebcamRunning;
  if (!video) return;

  const videoOptions = {
    video: true,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 60 },
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(videoOptions);
    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      video.addEventListener("loadeddata", () => {
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        console.log(
          `Video dimensions: ${video.videoWidth} x ${video.videoHeight}`
        );
        resolve();
      });
    });
  } catch (e) {
    console.error(e);
  }
}

async function predictWebcam() {
  if (!video) return;

  // check when last predicted
  const now = Date.now();
  if (video.currentTime !== lastVideoTime) {
    // update the video time
    lastVideoTime = video.currentTime;
    // predict
    results = gestureRecognizer?.recognizeForVideo(video, now);
  }

  // clear the canvas, so we can draw the new results
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // update the dimensions of the canvas
  canvasElement.style.height = `${video.videoHeight}px`;
  canvasElement.style.width = `${video.videoWidth}px`;

  if (results) {
    // display landmarks
    displayLandmarks(canvasCtx, results);

    // Log the position of the landmarks
    results.landmarks.forEach((landmarks, handIndex) => {
      // Check for thumbs-up gesture
      const thumbTipY = landmarks[4].y;
      const indexFingerBaseY = landmarks[5].y;
      const middleFingerBaseY = landmarks[9].y;
      const ringFingerBaseY = landmarks[13].y;
      const pinkyFingerBaseY = landmarks[17].y;

      if (
        thumbTipY < indexFingerBaseY &&
        thumbTipY < middleFingerBaseY &&
        thumbTipY < ringFingerBaseY &&
        thumbTipY < pinkyFingerBaseY
      ) {
        if (thumbsUpStartTime === null) {
          thumbsUpStartTime = now;
        } else {
          const elapsedTime = (now - thumbsUpStartTime) / 1000;
          console.log(`Thumbs-up held for ${elapsedTime.toFixed(2)} seconds`);
          const thumbTime = document.getElementById("thumbTime");
          thumbTime.innerText = `Thumbs-Up Time: ${Math.round(elapsedTime.toFixed(2))}s`;
          if (elapsedTime >= 5) {
            console.log("Going to the next page");
            thumbsUpStartTime = null;
            nextPageText.style.color = "green";
            window.location.href = "puzzle.html";
          }
        }
      } else {
        thumbsUpStartTime = null; // Reset the timer if the gesture is not held
        nextPageText.style.color = "red";
      }
    });

    const countingThumbsUp = results.landmarks.reduce((acc, landmarks) => {
      const thumbTipY = landmarks[4].y;
      const indexFingerBaseY = landmarks[5].y;
      const middleFingerBaseY = landmarks[9].y;
      const ringFingerBaseY = landmarks[13].y;
      const pinkyFingerBaseY = landmarks[17].y;

      if (
        thumbTipY < indexFingerBaseY &&
        thumbTipY < middleFingerBaseY &&
        thumbTipY < ringFingerBaseY &&
        thumbTipY < pinkyFingerBaseY
      ) {
        return acc + 1;
      }
      return acc;
    }, 0);

    // Update the thumbs-up counter in the HTML
    const thumbCounterElement = document.getElementById("thumbCounter");
    if (thumbCounterElement) {
      console.log(`Updating thumbs-up counter: ${countingThumbsUp}`);
      thumbCounterElement.innerText = `Thumbs-Up Counter: ${countingThumbsUp}`;
    } else {
      console.error("Thumbs-up counter element not found");
    }
  }

  // by restoring the canvas, we can draw the results
  canvasCtx.restore();

  // rerun prediction, when all logic is done inside this method
  if (isWebcamRunning) {
    window.requestAnimationFrame(predictWebcam);
    SCENE.render();
  }
}

function calculateDistance(
  point1: { x: number; y: number; z: number },
  point2: { x: number; y: number; z: number }
): number {
  const dx = point1.x - point2.x;
  const dy = point1.y - point2.y;
  const dz = point1.z - point2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
