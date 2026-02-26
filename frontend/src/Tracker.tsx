import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export default function TrackerCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    console.log("[TrackerCapture] Initialized WebView capture bridge.");

    const initStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor"
          }
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        videoRef.current = video;

        console.log("[TrackerCapture] Stream acquired successfully.");
      } catch (err) {
        console.error("[TrackerCapture] Failed to acquire stream:", err);
      }
    };

    initStream();

    const unlisten = listen('request_webrtc_screenshot', async () => {
      try {
        if (!videoRef.current) {
          console.warn("[TrackerCapture] No active video stream to capture from.");
          return;
        }

        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw current compositor frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert raw canvas pixels to base64 JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.50);
        const base64Data = dataUrl.split(',')[1]; // Strip "data:image/jpeg;base64,"

        // Send raw bytes back to Rust
        await invoke('submit_webrtc_screenshot', { base64Data });

      } catch (e) {
        console.error("[TrackerCapture] Error generating screenshot:", e);
      }
    });

    return () => {
      unlisten.then(f => f());
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(t => t.stop());
      }
    };
  }, []);

  return null;
}
