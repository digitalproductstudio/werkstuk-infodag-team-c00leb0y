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

// declare DOM elements
const video = document.querySelector("#webcam-puzzle") as HTMLVideoElement;
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
const handTracker = document.querySelector("#hand-tracker") as HTMLDivElement;

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
      console.log(`Hand ${handIndex + 1}:`);
      landmarks.forEach((landmark, index) => {
        console.log(`Landmark ${index}: ${JSON.stringify(landmark)}`);
      });

      // Check for pinch gesture
      const thumbTip = landmarks[4];
      const indexFingerTip = landmarks[8];
      const distance = calculateDistance(thumbTip, indexFingerTip);
      if (distance < 0.05) {
        // Adjust the threshold as needed
        console.log("Pinch gesture detected!");

        // Update the position of the hand-tracker div based on the index finger tip
        const indexFingerTipX = landmarks[8].x * video.videoWidth;
        const indexFingerTipY = landmarks[8].y * video.videoHeight;
        handTracker.style.left = `${indexFingerTipX}px`;
        handTracker.style.top = `${indexFingerTipY}px`;
      }
    });

    const countingPinches = results.landmarks.reduce(
      (pinchingBool, landmarks) => {
        const thumbTip = landmarks[4];
        const indexFingerTip = landmarks[8];
        const distance = calculateDistance(thumbTip, indexFingerTip);
        if (distance < 0.05) {
          return pinchingBool + 1;
        }
        return pinchingBool;
      },
      0
    );

    // Update the pinch counter in the HTML
    const pinchCounterElement = document.getElementById("pinchCounter");
    if (pinchCounterElement) {
      pinchCounterElement.innerText = `Pinch Counter: ${countingPinches}`;
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

//FUNCTIE OM DE COORDINATEN VAN EEN DIV TE KRIJGEN
function getDivLocation(divId: string) {
  const div = document.getElementById(divId);
  if (div) {
    const rect = div.getBoundingClientRect();
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  } else {
    console.error(`Div with id ${divId} not found`);
    return null;
  }
}


// VERANDER 2D NAAR 3D COORDINATEN
function convertTo3DCoordinates(divId: string, camera: THREE.Camera) {
  const divLocation = getDivLocation(divId);
  if (divLocation) {
    const x =
      ((divLocation.left + divLocation.width / 2) / window.innerWidth) * 2 - 1;
    const y =
      (-(divLocation.top + divLocation.height / 2) / window.innerHeight) * 2 +
      1;
    const z = 0.5; // Assuming a fixed depth for simplicity

    const vector = new THREE.Vector3(x, y, z);
    vector.unproject(camera);

    const dir = vector.sub(camera.position).normalize();
    const distance = -camera.position.z / dir.z;
    const pos = camera.position.clone().add(dir.multiplyScalar(distance));

    return { x: pos.x, y: pos.y, z: pos.z };
  } else {
    return null;
  }
}

// Example usage:
const divLocation = getDivLocation("piece-1");
console.log("devlocation");
if (divLocation) {
  console.log(
    `Div location: left ${divLocation.left}, top ${divLocation.top}, width ${divLocation.width}, height ${divLocation.height}`
  );
}

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 5); // Set the camera position
const div3DCoordinates = convertTo3DCoordinates("piece-1", camera);
if (div3DCoordinates) {
  console.log(
    `3D Coordinates: X ${div3DCoordinates.x}, Y ${div3DCoordinates.y}, Z ${div3DCoordinates.z}`
  );
}
