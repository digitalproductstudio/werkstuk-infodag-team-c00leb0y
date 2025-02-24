import { Scene } from "./AR/Scene";
import { Model } from "./AR/Model";
import { displayLandmarks } from "./lib/display";
import { hasGetUserMedia } from "./lib/utils";
import "./main.css";

import {
  FilesetResolver,
  GestureRecognizer,
  GestureRecognizerResult
} from "@mediapipe/tasks-vision";
import * as THREE from "three";


// declare variables
declare type RunningMode= "IMAGE" | "VIDEO";
let runningMode : RunningMode = "VIDEO";
let gestureRecognizer : GestureRecognizer | undefined;
let isWebcamRunning : boolean = false;
let lastVideoTime = -1;
let results : GestureRecognizerResult | undefined = undefined;


let SCENE : Scene


// declare DOM elements
const video = document.querySelector('#webcam') as HTMLVideoElement;
const canvasElement = document.querySelector('#output_canvas') as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext('2d') as CanvasRenderingContext2D;
const gestureOutput = document.querySelector('#gesture_output') as HTMLDivElement;
const btnEnableWebcam = document.querySelector('#webcamButton') as HTMLButtonElement;
const ARLayers = document.querySelector('#ar-layers') as HTMLElement;

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

  } catch(e) {
    console.error(e);
  }
}

async function createScene() {
  SCENE = new Scene(video.videoWidth, video.videoHeight, ARLayers);

  let bottleabeer = new Model(
    "beer_bottle/scene.gltf",
    new THREE.Vector3(0.02, 0.02, 0.02),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
    "Right"
  );

  let TOKTOK = new Model(
    "birbs/scene.gltf",
    new THREE.Vector3(0.005, 0.005, 0.005),
    new THREE.Vector3(0.5, 0, 0),
    new THREE.Vector3(0, 0, 0),
    "Left"
  );

  SCENE.add3DModel(bottleabeer);
  SCENE.add3DModel(TOKTOK);

}

async function createGestureRecognizer() {
  // Load the MediaPipe gesture recognizer
  // It is a web assembly file, so we need to load it using the FilesetResolver
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  gestureRecognizer = await GestureRecognizer.createFromOptions(
    vision,
    {
      numHands: 2,
      runningMode: runningMode,
      baseOptions: {
        delegate: "GPU",
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
      }
    }
  )

}
async function enableWebcam() {
  isWebcamRunning = !isWebcamRunning;
  if(!video) return;

  const videoOptions = {
    video: true,
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 60 }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(videoOptions);
    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      video.addEventListener('loadeddata', () => {
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        console.log(`Video dimensions: ${video.videoWidth} x ${video.videoHeight}`);
        resolve();
      });
    });
  } 
  catch(e) {
    console.error(e);
  }
}
async function predictWebcam() {
  if(!video) return;

  // check when last predicted
  const now = Date.now();
  if(video.currentTime !== lastVideoTime) {
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

  if(results) {
    // display landmarks
    displayLandmarks(canvasCtx, results);
    
    // iterate over every landmark array
    results?.landmarks.forEach((landmarks, index) => {

      // get hand of this landmark array
      const handedness = results?.handedness[index][0];
      const hand = handedness?.displayName;

      // check if we have a model that corresponds to this hand (e.g. no model needed for Left)
      const model = SCENE.models.find((model) => model.getHand() === hand);

      // position, rotate and scale the model to the hand
      if(model) {
        model.toggleVisibility(true);
        map3DModel(landmarks, model);
      }      
    });

    // hide the model when no hand is detected
    toggleVisibility(results);
  }

  // by restoring the canvas, we can draw the results
  canvasCtx.restore();


  // rerun prediction, when all logic is done inside this method
  if(isWebcamRunning) {
    window.requestAnimationFrame(predictWebcam);
    SCENE.render();
  }
}

function toggleVisibility(results : GestureRecognizerResult | undefined) {
  SCENE.models.forEach((model) => {
    const handIndex = results?.handedness.findIndex(
      (handedness) => handedness[0].displayName === model.getHand()
    );
    if (handIndex === -1) {
      model.toggleVisibility(false);
    }
  });
}

async function map3DModel(
  landmarks : { x: number, y: number, z: number }[],
  model : Model
) {
  const palmBase = landmarks[0];
  const indexFinger = landmarks[8];
  const thumb = landmarks[4];

  // scale

  // position
  let mX = (palmBase.x - 0.5) * 2;
  let mY = -(palmBase.y - 0.5) * 2;
  let mZ = -palmBase.z * 2;

  console.log(palmBase);
  console.log(mX, mY, mZ);
  model.setPosition(mX, mY, mZ);

  // rotate
  const midX = (indexFinger.x + thumb.x) / 2;
  const midY = (indexFinger.y + thumb.y) / 2;

  const dX = midX - palmBase.x;
  const dY = midY - palmBase.y;

  const angle = -Math.atan2(dY, dX) - Math.PI / 2;

  model.setRotation(0, 0, angle);


  // scale
  const scale = Math.sqrt(dX * dX + dY * dY) * 0.1;
  model.setScale(scale, scale, scale);

  
}