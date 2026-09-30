import { FilesetResolver, HandLandmarker, PoseLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { type Frame, tips, joints } from './core';
export class Tracker {
  private constructor(readonly hands: HandLandmarker, readonly pose: PoseLandmarker) {}
  static async load() {
    const base = import.meta.env.BASE_URL;
    const files = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
    const hands = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${base}landmarkers/hand.task`, delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try {
      const pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${base}landmarkers/pose.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      return new Tracker(hands, pose);
    } catch (e) { hands.close(); throw e; }
  }
  detect(video: HTMLVideoElement, canvas: HTMLCanvasElement, now: number): Frame {
    // Both tasks see the same frozen, unmirrored frame.
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const hands = this.hands.detectForVideo(canvas, now).landmarks;
    const pose = this.pose.detectForVideo(canvas, now).landmarks[0] ?? [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const drawing = new DrawingUtils(ctx);
    for (const hand of hands) {
      drawing.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, { color: '#71efd0', lineWidth: 2 });
      drawing.drawLandmarks(hand, { color: '#f4fffb', radius: 3 });
    }
    const upper = joints.map(i => pose[i]).filter(Boolean);
    drawing.drawLandmarks(upper, { color: '#ffc76a', radius: 5 });
    return { hand_0: tips.map(i => hands[0]?.[i]).filter(Boolean), hand_1: tips.map(i => hands[1]?.[i]).filter(Boolean), pose: upper };
  }
  dispose() { this.hands.close(); this.pose.close(); }
}
export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Доступ к камере закрыт. Разреши камеру в настройках сайта и нажми «Включить камеру».';
  if (name === 'NotFoundError') return 'Камера не найдена. Подключи её и попробуй снова.';
  if (name === 'NotReadableError') return 'Камера занята или недоступна. Закрой другие приложения с камерой и попробуй снова.';
  return error instanceof Error ? error.message : 'Не удалось запустить распознавание. Перезагрузи страницу.';
}
