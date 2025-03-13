import { Scene } from "./AR/Scene";
import { displayLandmarks } from "./lib/display";
import { hasGetUserMedia } from "./lib/utils";
import {
  FilesetResolver,
  GestureRecognizer,
  GestureRecognizerResult,
} from "@mediapipe/tasks-vision";
import * as THREE from "three";
import {
  answerAArray,
  answerBArray,
  answerCArray,
  handleQuizAnswer,
} from "./puzzle";

// declare variables
declare type RunningMode = "IMAGE" | "VIDEO";
let runningMode: RunningMode = "VIDEO";
let gestureRecognizer: GestureRecognizer | undefined;
let isWebcamRunning: boolean = false;
let lastVideoTime = -1;
let results: GestureRecognizerResult | undefined = undefined;

let SCENE: Scene;
let currentLevel = 1; // Track the current level

const sound = new Audio("public/start-13691.mp3");

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
const answerA = document.querySelector("#answer-a") as HTMLDivElement;
const answerB = document.querySelector("#answer-b") as HTMLDivElement;
const answerC = document.querySelector("#answer-c") as HTMLDivElement;

let answerTimers: { [key: string]: number | undefined } = {
  A: undefined,
  B: undefined,
  C: undefined,
};

export async function init() {
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

export async function enableWebcam() {
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

export async function predictWebcam() {
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
        // console.log(`Landmark ${index}: ${JSON.stringify(landmark)}`);
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

        // Log the hand tracker location
        // console.log(
        //   `Hand tracker location: (${indexFingerTipX}, ${indexFingerTipY})`
        // );

        // Check if the hand tracker is within the bounds of any answer
        if (isWithinBounds(indexFingerTipX, indexFingerTipY, answerAArray)) {
          startAnswerTimer("A");
        } else if (
          isWithinBounds(indexFingerTipX, indexFingerTipY, answerBArray)
        ) {
          startAnswerTimer("B");
        } else if (
          isWithinBounds(indexFingerTipX, indexFingerTipY, answerCArray)
        ) {
          startAnswerTimer("C");
        } else {
          resetAnswerColors();
          clearAnswerTimers();
        }
      } else {
        resetAnswerColors();
        clearAnswerTimers();
      }
    });

    const countingPinches = results.landmarks.reduce(
      (pinchingBool, landmarks) => {
        const thumbTip = landmarks[4];
        const indexFingerTip = landmarks[8];
        const distance = calculateDistance(thumbTip, indexFingerTip);
        if (distance < 0.05) {
          handTracker.style.backgroundColor = "green";
          //   console.log("Pinch gesture detected!");
          return pinchingBool + 1;
        } else {
          handTracker.style.backgroundColor = "red";
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

export function calculateDistance(
  point1: { x: number; y: number; z: number },
  point2: { x: number; y: number; z: number }
): number {
  const dx = point1.x - point2.x;
  const dy = point1.y - point2.y; // of moet dit point1.y zijn? 
  const dz = point1.z - point2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
  console.log(`Point 1: X: ${point1.x}; Y: ${point1.y}; Z: ${point1.z}`);
  console.log(`Point 2: X: ${point2.x}; Y: ${point2.y}; Z: ${point2.z}`); 
}



// Function to get the hand tracker location
export function getHandTrackerLocation() {
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

// Function to play the start sound
export function playSound() {
  sound.play().catch((error) => {
    console.error("Error playing audio:", error);
  });
}

// Function to show the level message
export function showLevelMessage(message: string) {
  // Create or get the message div
  let messageDiv = document.getElementById("level-message");
  if (!messageDiv) {
    messageDiv = document.createElement("div");
    messageDiv.id = "level-message";
    messageDiv.style.position = "absolute";
    messageDiv.style.top = "50%";
    messageDiv.style.left = "50%";
    messageDiv.style.transform = "translate(-50%, -50%)";
    messageDiv.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    messageDiv.style.color = "white";
    messageDiv.style.padding = "20px";
    messageDiv.style.borderRadius = "10px";
    messageDiv.style.textAlign = "center";
    messageDiv.style.zIndex = "1003"; // Higher than other elements
    messageDiv.style.fontSize = "24px";
    document.body.appendChild(messageDiv);
  }

  messageDiv.innerText = message;
  messageDiv.style.display = "block";

  // Hide the message after 3 seconds
  setTimeout(() => {
    if (messageDiv) {
      messageDiv.style.display = "none";
    }
  }, 3000);
}

// Function to check if a point is within the bounds of an answer area
function isWithinBounds(
  x: number,
  y: number,
  bounds: { left: number[]; top: number[] }[]
): boolean {
  return (
    x >= bounds[0].left[0] &&
    x <= bounds[0].left[1] &&
    y >= bounds[1].top[0] &&
    y <= bounds[1].top[1]
  );
}

// Function to process an answer
export async function processAnswer(answer: string) {
  console.log(`this is the answer on line 305 in the support ${answer}`);
  const answerElement = document.querySelector(
    `#answer-${answer.toLowerCase()}`
  );
  if (answerElement) {
    answerElement.classList.add("selected");
  }
  // Call the function in puzzle.ts to handle the answer
  handleQuizAnswer(answer);
}

// Function to reset the colors of the answer elements
function resetAnswerColors() {
  if (answerA) answerA.classList.remove("selected");
  if (answerB) answerB.classList.remove("selected");
  if (answerC) answerC.classList.remove("selected");
}

// Function to start a timer for an answer
function startAnswerTimer(answer: string) {
  if (answerTimers[answer]) return;

  const answerElement = document.querySelector(
    `#answer-${answer.toLowerCase()}`
  );
  if (answerElement) {
    answerElement.classList.add("selecting");
  }

  answerTimers[answer] = window.setTimeout(() => {
    processAnswer(answer);
    clearAnswerTimers();
  }, 2000);
}

// Function to clear all answer timers
function clearAnswerTimers() {
  Object.keys(answerTimers).forEach((key) => {
    if (answerTimers[key]) {
      clearTimeout(answerTimers[key]);
      answerTimers[key] = undefined;
    }
  });

  resetAnswerColors();
}
