import {
    GestureRecognizer,
    DrawingUtils,
    GestureRecognizerResult,
  } from "@mediapipe/tasks-vision";
  
  export const displayLandmarks = (
    canvasCtx: CanvasRenderingContext2D,
    results: GestureRecognizerResult
  ) => {
    let pencil: DrawingUtils = new DrawingUtils(canvasCtx);
  
    // draw landmarks
    if (!results?.landmarks) return;
  
    results.landmarks.forEach((landmarks, index) => {

  
      // handedness
      const handedness = results.handedness[index][0];
      const hand = handedness?.displayName === "Right" ? "R" : "L";
  
      pencil.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
        color: (hand === "L") ? "purple" : "yellow",
        fillColor: "white",
        lineWidth: 5,
      });
      pencil.drawLandmarks(landmarks, {
        color: (hand === "R") ? "black" : "orange",
        fillColor: "white",
        radius: 4,
      });
    });
  };