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
  processAnswer
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
    question: "Hoeland duurt deze opleiding?",
    options: {
      A: "1 jaar",
      B: "2 jaar",
      C: "3 jaar",
    },
    correctAnswer: "C",
  },
  {
    question: "Waarvoor staat IMD?",
    options: {
      A: "Informative Media Development",
      B: "Interactive Media Design",
      C: "Interactive Media Development",
    },
    correctAnswer: "C",
  },
  {
    question: "Waarvoor staat HTML?",
    options: {
      A: "Hyper Text Markup Language",
      B: "High Tech Modern Language",
      C: "Hybrid Text Machine Learning",
    },
    correctAnswer: "A",
  },
  {
    question: "Hoeveel studiepunten bevat 1 jaar?",
    options: {
      A: "50",
      B: "60",
      C: "70",
    },
    correctAnswer: "B",
  },
  {
    question: "Wat is de postcode van Gent?",
    options: {
      A: "9000",
      B: "7000",
      C: "6000",
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

    // Set the question title
    const questionTitle = document.querySelector(".question-title");
    if (questionTitle) {
      questionTitle.innerHTML = `Vraag ${currentQuestionIndex + 1}/${
        questions.length
      }: ${currentQuestion.question}`;
    }

    // Set the possible answers
    const answerA = document.querySelector(".display-answer-a");
    const answerB = document.querySelector(".display-answer-b");
    const answerC = document.querySelector(".display-answer-c");

    if (answerA) {
      answerA.innerHTML = `<strong>A</strong><br>${currentQuestion.options.A}`;
    }
    if (answerB) {
      answerB.innerHTML = `<strong>B</strong><br>${currentQuestion.options.B}`;
    }
    if (answerC) {
      answerC.innerHTML = `<strong>C</strong><br>${currentQuestion.options.C}`;
    }
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
  const questionTitle = document.querySelector(".question-title");
  if (questionTitle) {
    questionTitle.innerHTML = "Quiz Completed!";
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
    <button id="redirect-button" class="mdc-button mdc-button--raised" style="padding: 10px 20px; margin-top: 20px; background-color: #007f8b; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">Continue to Info Page</button>
  `;
  completionDiv.style.display = "block";

  // Add event listener to the button
  window.open("./info.html", "_self");
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

// Function to handle quiz answer from puzzle-support
export function handleQuizAnswer(answer: string) {
  console.log(`Quiz answer received: ${answer}`);
  processAnswer(answer);
}

// Initialize the quiz
startQuiz();

