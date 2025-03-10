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
let level1Interval: number | undefined;
let level2Interval: number | undefined;
let level3Interval: number | undefined;

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
      // console.log(`Hand ${handIndex + 1}:`);
      landmarks.forEach((landmark, index) => {
        //console.log(`Landmark ${index}: ${JSON.stringify(landmark)}`);
      });

      // Check for pinch gesture
      const thumbTip = landmarks[4];
      const indexFingerTip = landmarks[8];
      const distance = calculateDistance(thumbTip, indexFingerTip);
      if (distance < 0.05) {
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
if (divLocation) {
  console.log(
    `Div location: left ${divLocation.left}, top ${divLocation.top}, width ${divLocation.width}, height ${divLocation.height}`
  );

  // Check if the location is within the specified range
  if (
    divLocation.left >= 15 &&
    divLocation.left <= 50 &&
    divLocation.top >= 15 &&
    divLocation.top <= 50
  ) {
    console.log("Piece-1 is within the specified range!");
  }
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

// left tussen 15px en 50px
// top tussen 15px en 50px

function getHandTrackerLocation() {
  const handTracker = document.getElementById("hand-tracker");
  if (handTracker) {
    const rect = handTracker.getBoundingClientRect();
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  } else {
    console.error("Hand tracker element not found");
    return null;
  }
}

function checkHandTrackerLocation() {
  const handTrackerLocation = getHandTrackerLocation();
  if (handTrackerLocation) {
    // Check if the location is within the specified range for level 1
    if (
      handTrackerLocation.left >= 180 &&
      handTrackerLocation.left <= 270 &&
      handTrackerLocation.top >= 180 &&
      handTrackerLocation.top <= 350
    ) {
      // Proceed to level 2
      clearInterval(level1Interval); // Stop checking for level 1
      setTimeout(() => {
        startLevel2();
      }, 500); // Wait for 2 seconds before starting level 2
    }
  }
}

// Check the hand tracker location every 2 seconds for level 1
level1Interval = setInterval(checkHandTrackerLocation, 500);

function startLevel2() {

  // Make the triangle shape visible
  const triangleShape = document.getElementById("shape-triangle");
  const squareShape = document.getElementById("shape-square");
  const shapeChanger = document.getElementById("hand-tracker");
  if (triangleShape) {
    triangleShape.style.display = "block";
    console.log("Triangle shape is now visible");
    squareShape.style.display = "none";
    shapeChanger.style.backgroundColor = "red";
    shapeChanger.style.borderTop = "0";
    shapeChanger.style.borderLeft = "width / 2";
    shapeChanger.style.borderRight = "width / 2";
    shapeChanger.style.borderBottom = "height";
  }

  // Check the hand tracker location for level 2
  level2Interval = setInterval(checkHandTrackerLocationLevel2, 2000);
}

function checkHandTrackerLocationLevel2() {
  const handTrackerLocation = getHandTrackerLocation();
  if (handTrackerLocation) {
    // Check if the location is within the specified range for level 2
    if (
      handTrackerLocation.left >= 430 &&
      handTrackerLocation.left <= 600 &&
      handTrackerLocation.top >= 400 &&
      handTrackerLocation.top <= 550
    ) {
      // Proceed to level 3
      clearInterval(level2Interval); // Stop checking for level 2
      setTimeout(() => {
        startLevel3();
      }, 500); // Wait for 2 seconds before starting level 3
    }
  }
}

function startLevel3() {
  console.log("Starting level 3...");

  // Make the circle shape visible
  const circleShape = document.getElementById("shape-circle");
  const triangleShape = document.getElementById("shape-triangle");
  const shapeChanger = document.getElementById("hand-tracker");
  if (circleShape) {
    circleShape.style.display = "block";
    console.log("Circle shape is now visible");
    triangleShape.style.display = "none";
    shapeChanger.style.backgroundColor = "green";
    shapeChanger.style.borderRadius = "50%";
  }

  // Check the hand tracker location for level 3
  level3Interval = setInterval(checkHandTrackerLocationLevel3, 2000);
}

function checkHandTrackerLocationLevel3() {
  const handTrackerLocation = getHandTrackerLocation();
  if (handTrackerLocation) {
    console.log(
      `Hand tracker location: left ${handTrackerLocation.left}, top ${handTrackerLocation.top}, width ${handTrackerLocation.width}, height ${handTrackerLocation.height}`
    );

    // Check if the location is within the specified range for level 3
    if (
      handTrackerLocation.left >= 240 &&
      handTrackerLocation.left <= 360 &&
      handTrackerLocation.top >= 500 &&
      handTrackerLocation.top <= 600
    ) {
      console.log("Hand tracker is within the specified range for level 3!");
      clearInterval(level3Interval); // Stop checking for level 3
      console.log("All levels complete!");
      open('./info.html', '_self');
    }
  }
}

// Check the hand tracker location every 2 seconds for level 1
level1Interval = setInterval(checkHandTrackerLocation, 500);
