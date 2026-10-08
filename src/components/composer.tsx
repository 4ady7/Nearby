"use client";

import { ApiError, api } from "@/lib/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "./ui";

const kinds = [
  { id: "note", label: "A note", hint: "Words, nothing else" },
  { id: "photo", label: "A photo", hint: "From the camera roll" },
  { id: "voice", label: "A voice note", hint: "Up to a minute" },
  { id: "song", label: "A song", hint: "Title, and a link if you have one" },
  { id: "link", label: "A link", hint: "Something they'd like" },
  { id: "drawing", label: "A drawing", hint: "A small sketch" },
  { id: "thought", label: "A passing thought", hint: "Short, and enough" },
  { id: "video", label: "A short video", hint: "Up to a minute" },
] as const;

type Kind = (typeof kinds)[number]["id"];

export function Composer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const key = useRef<string | null>(null);
  const dirty = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    const draft = sessionStorage.getItem("between:draft:moment");
    if (draft) setBody(draft);
  }, []);

  useEffect(() => {
    if (body) sessionStorage.setItem("between:draft:moment", body);
    else sessionStorage.removeItem("between:draft:moment");
  }, [body]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [preview]);

  function resetKind() {
    setKind(null);
    setError(null);
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    dirty.current = false;
  }

  function close() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    onClose();
  }

  async function prepareFile(next: File) {
    if (next.type.startsWith("video/")) {
      const duration = await mediaDuration(next);
      if (duration > 60) {
        setError("Keep the video under a minute.");
        return;
      }
    }
    if (next.type.startsWith("image/") && next.type !== "image/gif") {
      const shrunk = await shrinkImage(next);
      setFile(shrunk);
      setPreview(URL.createObjectURL(shrunk));
      return;
    }
    setFile(next);
    if (next.type.startsWith("image/") || next.type.startsWith("video/") || next.type.startsWith("audio/")) {
      setPreview(URL.createObjectURL(next));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !kind) return;
    setPending(true);
    setError(null);
    if (!key.current) key.current = crypto.randomUUID();
    try {
      let upload = file;
      if (kind === "drawing") {
        if (!dirty.current || !canvasRef.current) throw new ApiError("Draw something first.", 400);
        const blob = await new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob(resolve, "image/png"));
        if (!blob) throw new ApiError("That drawing didn't save. Try again.", 500);
        upload = new File([blob], "drawing.png", { type: "image/png" });
      }
      const needsFile = kind === "photo" || kind === "video" || kind === "voice" || kind === "drawing";
      if (needsFile) {
        if (!upload) throw new ApiError(kind === "voice" ? "Record something first." : "Choose a file first.", 400);
        const form = new FormData();
        form.set("kind", kind);
        if (body.trim()) form.set("body", body.trim());
        form.set("file", upload);
        if (kind === "voice" || kind === "video") {
          const duration = await mediaDuration(upload).catch(() => 0);
          if (duration) form.set("durationMs", String(Math.round(duration * 1000)));
        }
        await api("/api/moments", { method: "POST", body: form, idempotencyKey: key.current });
      } else {
        await api("/api/moments", {
          method: "POST",
          idempotencyKey: key.current,
          json: {
            kind,
            body: body.trim() || null,
            linkTitle: title.trim() || null,
            detail: detail.trim() || null,
            linkUrl: url.trim() || null,
          },
        });
      }
      key.current = null;
      sessionStorage.removeItem("between:draft:moment");
      setBody("");
      setTitle("");
      setDetail("");
      setUrl("");
      setFile(null);
      setKind(null);
      close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't send. It's still here.");
    } finally {
      setPending(false);
    }
  }

  async function toggleRecord() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const media = new MediaRecorder(stream, MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : undefined);
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      media.onstop = () => {
        const blob = new Blob(chunks.current, { type: mime });
        const next = new File([blob], mime === "audio/mp4" ? "note.m4a" : "note.webm", { type: mime });
        setFile(next);
        setPreview(URL.createObjectURL(next));
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.current = media;
      media.start();
      setRecording(true);
      setSeconds(0);
    } catch {
      setError("The microphone stayed off. You can allow it in the browser, or leave a note instead.");
    }
  }

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value >= 59) {
          recorder.current?.stop();
          return 60;
        }
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (kind !== "drawing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.fillStyle = getComputedStyle(canvas).getPropertyValue("--paper") || "#fbf7f2";
    const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#fbf7f2";
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#241c17";
    context.fillStyle = paper;
    context.fillRect(0, 0, rect.width, rect.height);
    context.strokeStyle = ink;
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    let drawing = false;
    const point = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const down = (event: PointerEvent) => {
      drawing = true;
      dirty.current = true;
      canvas.setPointerCapture(event.pointerId);
      const p = point(event);
      context.beginPath();
      context.moveTo(p.x, p.y);
    };
    const move = (event: PointerEvent) => {
      if (!drawing) return;
      const p = point(event);
      context.lineTo(p.x, p.y);
      context.stroke();
      context.beginPath();
      context.moveTo(p.x, p.y);
    };
    const up = () => {
      drawing = false;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [kind]);

  return (
    <Dialog open={open} title={kind ? kinds.find((item) => item.id === kind)?.label || "Leave something" : "Leave something"} onClose={close}>
      {!kind ? (
        <div className="choice-grid">
          {kinds.map((item) => (
            <button key={item.id} type="button" className="choice" onClick={() => setKind(item.id)}>
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <button type="button" className="btn quiet small" onClick={resetKind}>
            Choose something else
          </button>
          {kind === "photo" || kind === "video" ? (
            <label className="field">
              <span>{kind === "photo" ? "Photo" : "Video"}</span>
              <input
                type="file"
                accept={kind === "photo" ? "image/*" : "video/mp4,video/webm,video/quicktime"}
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  if (next) void prepareFile(next);
                }}
              />
            </label>
          ) : null}
          {preview && (kind === "photo" || kind === "video") ? (
            kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Selected photo preview" className="media" />
            ) : (
              <video src={preview} className="media video" controls playsInline />
            )
          ) : null}
          {kind === "voice" ? (
            <div className="stack">
              <button type="button" className="btn secondary" onClick={() => void toggleRecord()}>
                {recording ? `Stop · 0:${String(seconds).padStart(2, "0")}` : file ? "Record again" : "Start recording"}
              </button>
              <p className="hint">The recording stays on this screen until you send it or leave.</p>
              {preview && file ? <audio src={preview} controls /> : null}
            </div>
          ) : null}
          {kind === "drawing" ? (
            <div className="stack">
              <div className="canvas-wrap">
                <canvas ref={canvasRef} aria-label="Drawing canvas" />
              </div>
              <button
                type="button"
                className="btn quiet small"
                onClick={() => {
                  const canvas = canvasRef.current;
                  const context = canvas?.getContext("2d");
                  if (!canvas || !context) return;
                  const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#fbf7f2";
                  context.fillStyle = paper;
                  context.fillRect(0, 0, canvas.width, canvas.height);
                  dirty.current = false;
                }}
              >
                Clear drawing
              </button>
            </div>
          ) : null}
          {kind === "song" || kind === "link" ? (
            <>
              <label className="field">
                <span>{kind === "song" ? "Song" : "Title, if you want"}</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required={kind === "song"} />
              </label>
              {kind === "song" ? (
                <label className="field">
                  <span>Artist</span>
                  <input value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={80} />
                </label>
              ) : null}
              <label className="field">
                <span>{kind === "link" ? "Link" : "Link, if you have one"}</span>
                <input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} required={kind === "link"} placeholder="https://" />
              </label>
            </>
          ) : null}
          {kind !== "drawing" ? (
            <label className="field">
              <span>{kind === "note" ? "Note" : kind === "thought" ? "Thought" : "A few words, if you want"}</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={kind === "thought" ? 280 : 2000}
                required={kind === "note" || kind === "thought"}
              />
            </label>
          ) : null}
          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Leaving it…" : "Leave it"}
          </button>
        </form>
      )}
    </Dialog>
  );
}

async function mediaDuration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const element = document.createElement(file.type.startsWith("audio") ? "audio" : "video");
    element.preload = "metadata";
    const duration = await new Promise<number>((resolve, reject) => {
      element.onloadedmetadata = () => resolve(element.duration);
      element.onerror = () => reject(new Error("unreadable"));
      element.src = url;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function shrinkImage(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 2000;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
