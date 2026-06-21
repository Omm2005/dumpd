"use client";

import { useEffect, useRef } from "react";

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
};

const SPARK_COLORS = ["#e9b949", "#91c8e4", "#c1a6e8", "#efb2bd"];

export function EnchantedAmbience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const canvasContext = canvasElement.getContext("2d");
    if (!canvasContext) return;

    const activeCanvas: HTMLCanvasElement = canvasElement;
    const activeContext: CanvasRenderingContext2D = canvasContext;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const sparks: Spark[] = [];
    let frame = 0;
    let lastX = -100;
    let lastY = -100;
    let lastSpawn = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      activeCanvas.width = window.innerWidth * ratio;
      activeCanvas.height = window.innerHeight * ratio;
      activeCanvas.style.width = `${window.innerWidth}px`;
      activeCanvas.style.height = `${window.innerHeight}px`;
      activeContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function spawn(event: PointerEvent) {
      if (
        reducedMotion ||
        event.pointerType === "touch" ||
        performance.now() - lastSpawn < 20
      ) {
        return;
      }

      const distance = Math.hypot(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
      if (distance < 4) return;
      lastSpawn = performance.now();

      const amount = Math.min(3, Math.max(1, Math.floor(distance / 18)));
      for (let index = 0; index < amount; index += 1) {
        const maxLife = 28 + Math.random() * 22;
        sparks.push({
          x: event.clientX + (Math.random() - 0.5) * 8,
          y: event.clientY + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 0.65,
          vy: -0.25 - Math.random() * 0.65,
          life: maxLife,
          maxLife,
          size: 1.4 + Math.random() * 2.2,
          color:
            SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)]!,
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.12,
        });
      }
      if (sparks.length > 64) sparks.splice(0, sparks.length - 64);
    }

    function drawSpark(spark: Spark) {
      const alpha = Math.sin((spark.life / spark.maxLife) * Math.PI);
      activeContext.save();
      activeContext.translate(spark.x, spark.y);
      activeContext.rotate(spark.rotation);
      activeContext.globalAlpha = alpha * 0.9;
      activeContext.fillStyle = spark.color;
      activeContext.shadowColor = spark.color;
      activeContext.shadowBlur = 7;
      activeContext.beginPath();
      activeContext.moveTo(0, -spark.size * 1.9);
      activeContext.quadraticCurveTo(
        spark.size * 0.35,
        -spark.size * 0.35,
        spark.size * 1.9,
        0,
      );
      activeContext.quadraticCurveTo(
        spark.size * 0.35,
        spark.size * 0.35,
        0,
        spark.size * 1.9,
      );
      activeContext.quadraticCurveTo(
        -spark.size * 0.35,
        spark.size * 0.35,
        -spark.size * 1.9,
        0,
      );
      activeContext.quadraticCurveTo(
        -spark.size * 0.35,
        -spark.size * 0.35,
        0,
        -spark.size * 1.9,
      );
      activeContext.fill();
      activeContext.restore();
    }

    function animate() {
      activeContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        const spark = sparks[index]!;
        spark.life -= 1;
        if (spark.life <= 0) {
          sparks.splice(index, 1);
          continue;
        }
        spark.x += spark.vx;
        spark.y += spark.vy;
        spark.vy += 0.012;
        spark.rotation += spark.spin;
        drawSpark(spark);
      }
      frame = window.requestAnimationFrame(animate);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", spawn, { passive: true });
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", spawn);
    };
  }, []);

  return (
    <div className="enchanted-ambience" aria-hidden="true">
      <div className="enchanted-aurora enchanted-aurora-sky" />
      <div className="enchanted-aurora enchanted-aurora-rose" />
      <div className="enchanted-moon">
        <span />
      </div>
      <svg
        className="enchanted-botanical enchanted-botanical-left"
        viewBox="0 0 260 520"
        fill="none"
      >
        <path
          d="M22 515C38 380 91 282 187 185C221 151 240 98 236 35"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        {[
          [42, 420, -26],
          [66, 355, 26],
          [91, 306, -29],
          [123, 254, 30],
          [157, 212, -30],
          [191, 164, 25],
          [215, 106, -21],
        ].map(([x, y, rotate]) => (
          <ellipse
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            rx="11"
            ry="28"
            transform={`rotate(${rotate} ${x} ${y})`}
            fill="currentColor"
            fillOpacity=".13"
            stroke="currentColor"
            strokeWidth=".7"
          />
        ))}
      </svg>
      <svg
        className="enchanted-botanical enchanted-botanical-right"
        viewBox="0 0 300 560"
        fill="none"
      >
        <path
          d="M289 550C262 405 218 323 139 246C79 188 48 114 58 18"
          stroke="currentColor"
          strokeWidth="1"
        />
        {[
          [266, 455, 25],
          [240, 390, -26],
          [209, 337, 28],
          [174, 288, -28],
          [135, 241, 29],
          [98, 188, -25],
          [70, 120, 20],
        ].map(([x, y, rotate]) => (
          <ellipse
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            rx="12"
            ry="31"
            transform={`rotate(${rotate} ${x} ${y})`}
            fill="currentColor"
            fillOpacity=".1"
            stroke="currentColor"
            strokeWidth=".7"
          />
        ))}
      </svg>
      <div className="enchanted-star-field">
        {Array.from({ length: 18 }, (_, index) => (
          <span
            key={index}
            style={
              {
                "--star-x": `${6 + ((index * 47) % 90)}%`,
                "--star-y": `${8 + ((index * 31) % 82)}%`,
                "--star-delay": `${(index % 7) * -0.7}s`,
                "--star-size": `${index % 5 === 0 ? 4 : 2}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <canvas ref={canvasRef} className="enchanted-spark-canvas" />
    </div>
  );
}
