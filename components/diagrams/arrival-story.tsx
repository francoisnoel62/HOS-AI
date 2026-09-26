"use client";

import { ArrowRight, Brush, Check, CircleAlert, Hotel, MessageSquare, Pause, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { HOSMark } from "@/components/brand/hos-mark";

import styles from "./arrival-story.module.css";

const duration = 16000;
const motionQuery = "(prefers-reduced-motion: reduce)";
const getMotionPreference = () => window.matchMedia(motionQuery).matches;
const getServerMotionPreference = () => true;
function subscribeToMotionPreference(onChange: () => void) {
  const preference = window.matchMedia(motionQuery);
  preference.addEventListener("change", onChange);
  return () => preference.removeEventListener("change", onChange);
}

export function EventFlowDiagram() {
  const figureRef = useRef<HTMLElement>(null);
  const animationsRef = useRef<Animation[]>([]);
  const pausedRef = useRef(false);
  const visibleRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getMotionPreference, getServerMotionPreference);
  const showPlay = paused;

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;

    const animate = (element: Element, frames: Keyframe[]) => {
      const animation = element.animate(frames, {
        duration, iterations: Infinity, fill: "both",
      });
      animation.pause();
      animationsRef.current.push(animation);
      return animation;
    };
    const reveal = (element: Element, start: number, lift = 10) => {
      const entrance = reducedMotion ? "none" : `translateY(${lift}px)`;
      animate(element, [
        { opacity: 0, transform: entrance, offset: 0 },
        { opacity: 0, transform: entrance, offset: start, easing: "cubic-bezier(.16,1,.3,1)" },
        { opacity: 1, transform: "none", offset: start + 0.04 },
        { opacity: 1, transform: "none", offset: 0.95 },
        { opacity: 0, transform: "none", offset: 1 },
      ]);
    };
    const starts = [0.025, 0.10, 0.19, 0.265, 0.35];
    figure.querySelectorAll("[data-flow-event]").forEach((event, index) => reveal(event, starts[index]));

    figure.querySelectorAll("[data-source-card]").forEach((card, index) => {
      const start = [0.025, 0.19, 0.35][index];
      animate(card, [
        { borderColor: "var(--story-border)", offset: 0 },
        { borderColor: "var(--story-border)", offset: start },
        { borderColor: index === 2 ? "var(--story-amber)" : "var(--story-blue)", offset: start + 0.045 },
        { borderColor: "var(--story-border)", offset: start + 0.15 },
      ]);
    });

    figure.querySelectorAll("[data-signal-path]").forEach((path, index) => {
      const start = 0.39 + index * 0.025;
      animate(path, [
        { strokeDashoffset: 1, opacity: 0, offset: 0 },
        { strokeDashoffset: 1, opacity: 1, offset: start },
        { strokeDashoffset: 0, opacity: 1, offset: start + 0.08 },
        { strokeDashoffset: 0, opacity: 1, offset: 0.95 },
        { strokeDashoffset: 0, opacity: 0, offset: 1 },
      ]);
    });
    const hub = figure.querySelector("[data-hos-hub]");
    if (hub) animate(hub, [
      { boxShadow: "0 0 0 0 transparent", borderColor: "var(--story-border)", offset: 0 },
      { boxShadow: "0 0 0 0 transparent", borderColor: "var(--story-border)", offset: 0.43 },
      { boxShadow: "var(--story-hub-pulse)", borderColor: "var(--story-blue)", offset: 0.49 },
      { boxShadow: "var(--story-hub-glow)", borderColor: "var(--story-blue)", offset: 0.56 },
      { boxShadow: "var(--story-hub-glow)", borderColor: "var(--story-blue)", offset: 0.95 },
      { boxShadow: "0 0 0 0 transparent", borderColor: "var(--story-border)", offset: 1 },
    ]);
    const insight = figure.querySelector("[data-hos-insight]");
    if (insight) reveal(insight, 0.46, 5);
    const alert = figure.querySelector("[data-flow-alert]");
    if (alert) reveal(alert, 0.55, 16);
    const pending = figure.querySelector("[data-pending-insight]");
    if (pending) animate(pending, [
      { opacity: 1, offset: 0 }, { opacity: 1, offset: 0.52 },
      { opacity: 0, offset: 0.55 }, { opacity: 0, offset: 1 },
    ]);

    // One shared clock keeps the narration, signals and reveal in sync when paused.
    figure.querySelectorAll("[data-story-caption]").forEach((caption, index) => {
      const start = [0, 0.40, 0.55][index];
      const end = [0.40, 0.55, 1][index];
      animate(caption, [
        { opacity: index === 0 ? 1 : 0, offset: 0 },
        ...(index > 0 ? [{ opacity: 0, offset: start }, { opacity: 1, offset: start + 0.02 }] : []),
        { opacity: 1, offset: end - 0.02 },
        { opacity: 0, offset: end },
        ...(index < 2 ? [{ opacity: 0, offset: 1 }] : []),
      ]);
    });
    figure.querySelectorAll("[data-chapter-progress]").forEach((bar, index) => {
      const start = [0, 0.40, 0.55][index];
      const end = [0.40, 0.55, 1][index];
      animate(bar, [
        { transform: "scaleX(0)", offset: 0 },
        ...(index > 0 ? [{ transform: "scaleX(0)", offset: start }] : []),
        { transform: "scaleX(1)", offset: end },
        ...(index < 2 ? [{ transform: "scaleX(1)", offset: 1 }] : []),
      ]);
    });
    const syncPlayback = () => {
      const playing = visibleRef.current && !document.hidden && !pausedRef.current;
      animationsRef.current.forEach((animation) => playing ? animation.play() : animation.pause());
    };
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0.25 });
    observer.observe(figure);
    document.addEventListener("visibilitychange", syncPlayback);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
      animationsRef.current.forEach((animation) => animation.cancel());
      animationsRef.current = [];
    };
  }, [reducedMotion]);

  const togglePlayback = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    animationsRef.current.forEach((animation) => {
      if (pausedRef.current || !visibleRef.current || document.hidden) animation.pause();
      else animation.play();
    });
  };
  const replay = () => {
    pausedRef.current = false;
    setPaused(false);
    animationsRef.current.forEach((animation) => {
      animation.currentTime = 0;
      if (visibleRef.current && !document.hidden) animation.play();
    });
  };

  return (
    <figure ref={figureRef} className={styles.story} aria-label="How HOS spots an early-arrival risk">
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.topline}>
          <div className={styles.eyebrow}><span className={styles.statusDot} /> A hotel morning</div>
          <div className={styles.buttons}>
            <button aria-label={showPlay ? "Play arrival animation" : "Pause arrival animation"} onClick={togglePlayback} type="button">
              {showPlay ? <Play aria-hidden="true" size={13} /> : <Pause aria-hidden="true" size={13} />}{showPlay ? "Play story" : "Pause"}
            </button>
            <button aria-label="Replay arrival animation" onClick={replay} type="button"><RotateCcw aria-hidden="true" size={13} /><span className="sr-only">Replay</span></button>
          </div>
        </div>
        <p className={styles.headline}>The guest is early.<br /><span>See the risk before they do.</span></p>
        <div className={styles.narration} aria-hidden="true">
          <p data-story-caption>Three tools. Three separate facts.</p>
          <p data-story-caption>HOS connects the dots.</p>
          <p data-story-caption>One shared picture. Time to respond.</p>
        </div>
      </header>

      <div className={styles.sources}>
        <div className={styles.source} data-source-card>
          <div className={styles.sourceName}><Hotel size={16} aria-hidden="true" /><span>PMS</span></div>
          <div data-flow-event className={styles.smallFact}><Check size={11} aria-hidden="true" /> Confirmed</div>
          <div data-flow-event className={styles.fact}><strong>15:00</strong><span>Check-in · room 204</span></div>
        </div>
        <div className={styles.source} data-source-card>
          <div className={styles.sourceName}><Brush size={16} aria-hidden="true" /><span>Housekeeping</span></div>
          <div data-flow-event className={styles.smallFact}><span className={styles.oldStatus}>Room dirty</span><ArrowRight size={11} aria-hidden="true" /></div>
          <div data-flow-event className={styles.fact}><strong className={styles.wordFact}>Cleaned</strong><span className={styles.pending}>Not inspected</span></div>
        </div>
        <div className={`${styles.source} ${styles.guestSource}`} data-source-card>
          <div className={styles.sourceName}><MessageSquare size={16} aria-hidden="true" /><span>Guest message</span></div>
          <div data-flow-event className={styles.message}><span>“We’ll be there at</span><strong>12:00<span>”</span></strong><span className={styles.early}>3 hours early</span></div>
        </div>
      </div>

      <div className={styles.connection}>
        <svg className={styles.wires} viewBox="0 0 480 104" fill="none" preserveAspectRatio="none" aria-hidden="true">
          {[
            "M78 0 V22 Q78 38 94 38 H220 Q240 38 240 58 V80",
            "M240 0 V80",
            "M402 0 V22 Q402 38 386 38 H260 Q240 38 240 58 V80",
          ].map((path, index) => <g key={path}>
            <path d={path} stroke="var(--story-border)" strokeWidth="1.3" />
            <path data-signal-path d={path} pathLength="1" stroke={index === 2 ? "var(--story-amber)" : "var(--story-blue)"} strokeWidth="2" strokeDasharray="1" />
          </g>)}
        </svg>
        <div data-hos-hub className={styles.hub}><HOSMark className="h-7 w-7" /><span>HOS</span></div>
        <p data-hos-insight className={styles.insight}>The same room. The whole picture.</p>
      </div>

      <div className={styles.outcome}>
        <div data-pending-insight className={styles.pendingInsight} aria-hidden="true"><CircleAlert size={21} /><strong>The risk is still hidden.</strong><span>No single tool has the whole picture.</span></div>
        <div data-flow-alert className={styles.alert}>
          <div className={styles.alertEyebrow}><CircleAlert size={15} aria-hidden="true" /> Early arrival · risk detected <span>204</span></div>
          <p className={styles.alertTitle}><span className="sr-only">Alert: </span>room 204 may not be ready in time</p>
          <p className={styles.alertDetail}>Expected at 12:00. Inspection still pending.</p>
          <div className={styles.authority}><ShieldCheck size={14} aria-hidden="true" /><span>HOS alerts. <strong>Your team decides.</strong></span></div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.chapters} aria-hidden="true">
          {["The signals", "The connection", "The heads-up"].map((chapter, index) => <div key={chapter}>
            <div className={styles.track}><span data-chapter-progress /></div>
            <span className={styles.chapterLabel}><span>0{index + 1}</span> {chapter}</span>
          </div>)}
        </div>
        <div className={styles.controls}>
          <span className={styles.duration}>Illustrative scenario <span>· 16 seconds</span></span>
          <span className={styles.version}>HOS 0.1</span>
        </div>
      </footer>
      <figcaption className="sr-only">Illustrative early arrival for room 204. The PMS expects check-in at 15:00. Housekeeping reports the room dirty, then cleaned but not inspected. The guest expects to arrive at 12:00. HOS connects these facts and alerts the front desk that the room may not be ready. HOS does not change the booking or check the guest in; the team decides what to do.</figcaption>
    </figure>
  );
}
