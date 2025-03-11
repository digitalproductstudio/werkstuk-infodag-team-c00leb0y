import { Scene } from "./AR/Scene";
import { displayLandmarks } from "./lib/display";
import { hasGetUserMedia } from "./lib/utils";
import "./main.css";
import {
  init,
  enableWebcam,
  predictWebcam,
  getHandTrackerLocation,
  playSound,
  showLevelMessage,
} from "./puzzle-support";

import {
  FilesetResolver,
  GestureRecognizer,
  GestureRecognizerResult,
} from "@mediapipe/tasks-vision";
import * as THREE from "three";

// Export the answer arrays
export const answerAArray = [{ left: [80, 180] }, { top: [80, 180] }];
export const answerBArray = [{ left: [280, 380] }, { top: [80, 180] }];
export const answerCArray = [{ left: [480, 580] }, { top: [80, 180] }];

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

init();

// Quiz functionality
interface Question {
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
  };
  correctAnswer: "A" | "B" | "C";
}

const questions: Question[] = [
  {
    question: "What programming language is this application built with?",
    options: {
      A: "JavaScript",
      B: "TypeScript",
      C: "Python",
    },
    correctAnswer: "B",
  },
  {
    question: "Which of these is NOT a JavaScript framework?",
    options: {
      A: "React",
      B: "Angular",
      C: "Flask",
    },
    correctAnswer: "C",
  },
  {
    question: "What does HTML stand for?",
    options: {
      A: "Hyper Text Markup Language",
      B: "High Tech Modern Language",
      C: "Hybrid Text Machine Learning",
    },
    correctAnswer: "A",
  },
];

let currentQuestionIndex = 0;
let currentQuestion: Question | null = null;
let answerBeingProcessed = false;

// Function to display a question
function displayQuestion() {
  if (currentQuestionIndex < questions.length) {
    currentQuestion = questions[currentQuestionIndex];

    // Create or get the question display div
    let questionDiv = document.getElementById("question-display");
    if (!questionDiv) {
      questionDiv = document.createElement("div");
      questionDiv.id = "question-display";
      questionDiv.style.position = "absolute";
      questionDiv.style.top = "50px";
      questionDiv.style.left = "50%";
      questionDiv.style.transform = "translateX(-50%)";
      questionDiv.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      questionDiv.style.color = "white";
      questionDiv.style.padding = "20px";
      questionDiv.style.borderRadius = "10px";
      questionDiv.style.textAlign = "center";
      questionDiv.style.zIndex = "1000";
      questionDiv.style.width = "80%";
      questionDiv.style.maxWidth = "600px";
      document.body.appendChild(questionDiv);
    }

    // Add the question and options to the div
    questionDiv.innerHTML = `
      <h2>Question ${currentQuestionIndex + 1}/${questions.length}</h2>
      <p>${currentQuestion.question}</p>
      <div style="display: flex; justify-content: space-between; margin-top: 20px;">
        <div id="option-A" style="flex: 1; margin: 0 10px; text-align: center; border: 2px solid white; padding: 10px; border-radius: 5px; cursor: pointer;">
          <strong>A</strong><br>${currentQuestion.options.A}
        </div>
        <div id="option-B" style="flex: 1; margin: 0 10px; text-align: center; border: 2px solid white; padding: 10px; border-radius: 5px; cursor: pointer;">
          <strong>B</strong><br>${currentQuestion.options.B}
        </div>
        <div id="option-C" style="flex: 1; margin: 0 10px; text-align: center; border: 2px solid white; padding: 10px; border-radius: 5px; cursor: pointer;">
          <strong>C</strong><br>${currentQuestion.options.C}
        </div>
      </div>
    `;

    // Add event listeners to the options
    document
      .getElementById("option-A")
      ?.addEventListener("click", () => processAnswer("A"));
    document
      .getElementById("option-B")
      ?.addEventListener("click", () => processAnswer("B"));
    document
      .getElementById("option-C")
      ?.addEventListener("click", () => processAnswer("C"));
  } else {
    // All questions answered
    finishQuiz();
  }
}

// Function to process an answer
function processAnswer(selectedAnswer: string) {
  if (answerBeingProcessed || !currentQuestion) return;

  answerBeingProcessed = true;
  console.log(`Processing answer: ${selectedAnswer}`);

  if (selectedAnswer === currentQuestion.correctAnswer) {
    // Correct answer
    showFeedback(true);
    setTimeout(() => {
      currentQuestionIndex++;
      displayQuestion();
      answerBeingProcessed = false;
    }, 1500);
  } else {
    // Wrong answer
    showFeedback(false);
    setTimeout(() => {
      answerBeingProcessed = false;
    }, 1500);
  }
}

// Function to show feedback
function showFeedback(isCorrect: boolean) {
  // Create or get the feedback div
  let feedbackDiv = document.getElementById("feedback-display");
  if (!feedbackDiv) {
    feedbackDiv = document.createElement("div");
    feedbackDiv.id = "feedback-display";
    feedbackDiv.style.position = "absolute";
    feedbackDiv.style.top = "50%";
    feedbackDiv.style.left = "50%";
    feedbackDiv.style.transform = "translate(-50%, -50%)";
    feedbackDiv.style.backgroundColor = isCorrect
      ? "rgba(0, 128, 0, 0.7)"
      : "rgba(255, 0, 0, 0.7)";
    feedbackDiv.style.color = "white";
    feedbackDiv.style.padding = "20px";
    feedbackDiv.style.borderRadius = "10px";
    feedbackDiv.style.textAlign = "center";
    feedbackDiv.style.zIndex = "1001";
    feedbackDiv.style.fontSize = "32px";
    document.body.appendChild(feedbackDiv);
  } else {
    feedbackDiv.style.backgroundColor = isCorrect
      ? "rgba(0, 128, 0, 0.7)"
      : "rgba(255, 0, 0, 0.7)";
  }

  feedbackDiv.innerText = isCorrect ? "Correct!" : "Wrong answer!";
  feedbackDiv.style.display = "block";

  // Hide feedback after 1.5 seconds
  setTimeout(() => {
    if (feedbackDiv) {
      feedbackDiv.style.display = "none";
    }
  }, 1500);
}

// Function to finish the quiz
function finishQuiz() {
  // Hide question display
  const questionDiv = document.getElementById("question-display");
  if (questionDiv) {
    questionDiv.style.display = "none";
  }

  // Show completion message
  let completionDiv = document.getElementById("completion-display");
  if (!completionDiv) {
    completionDiv = document.createElement("div");
    completionDiv.id = "completion-display";
    completionDiv.style.position = "absolute";
    completionDiv.style.top = "50%";
    completionDiv.style.left = "50%";
    completionDiv.style.transform = "translate(-50%, -50%)";
    completionDiv.style.backgroundColor = "rgba(0, 128, 0, 0.7)";
    completionDiv.style.color = "white";
    completionDiv.style.padding = "20px";
    completionDiv.style.borderRadius = "10px";
    completionDiv.style.textAlign = "center";
    completionDiv.style.zIndex = "1002";
    completionDiv.style.fontSize = "24px";
    document.body.appendChild(completionDiv);
  }

  completionDiv.innerHTML = `
    <h2>Quiz Completed!</h2>
    <p>You have answered all questions!</p>
    <button id="redirect-button" style="padding: 10px 20px; margin-top: 20px; background-color: #007f8b; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">Continue to Info Page</button>
  `;
  completionDiv.style.display = "block";

  // Add event listener to the button
  const redirectButton = document.getElementById("redirect-button");
  if (redirectButton) {
    redirectButton.addEventListener("click", () => {
      window.open("./info.html", "_self");
    });
  }
}

// Function to start the quiz
function startQuiz() {
  console.log("Starting quiz...");
  currentQuestionIndex = 0;

  // Show the first question
  setTimeout(() => {
    console.log("Displaying first question");
    displayQuestion();
  }, 1000);

  // Start predicting webcam gestures
  predictWebcam();
}

// Initialize the quiz
startQuiz();
