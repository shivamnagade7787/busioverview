/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
}

export default function CameraCapture({ isOpen, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setError(null);
    }
    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-black text-white border-none">
        <DialogHeader className="p-4 bg-slate-900 border-b border-slate-800">
          <DialogTitle className="text-white flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Capture Bill Photo
          </DialogTitle>
        </DialogHeader>

        <div className="relative aspect-[3/4] bg-slate-950 flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="p-6 text-center">
              <p className="text-danger mb-4">{error}</p>
              <Button variant="outline" onClick={startCamera}>Try Again</Button>
            </div>
          ) : capturedImage ? (
            <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="p-6 bg-slate-900 flex justify-center items-center gap-6">
          {!capturedImage ? (
            <Button 
              size="lg" 
              className="rounded-full w-16 h-16 p-0 bg-white hover:bg-slate-200 text-black border-4 border-slate-700" 
              onClick={takePhoto}
            >
              <div className="w-12 h-12 rounded-full border-2 border-slate-900" />
            </Button>
          ) : (
            <div className="flex gap-4 w-full">
              <Button 
                variant="outline" 
                className="flex-1 gap-2 bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                onClick={handleRetake}
              >
                <RefreshCw className="w-4 h-4" /> Retake
              </Button>
              <Button 
                className="flex-1 gap-2"
                onClick={handleConfirm}
              >
                <Check className="w-4 h-4" /> Use Photo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
