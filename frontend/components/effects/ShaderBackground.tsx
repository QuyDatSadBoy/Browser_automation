"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Animated WebGL gradient mesh background.
 * Full-viewport fixed canvas. Subtle, low-saturation, behind UI.
 * Uses simplex-ish noise to warp two color blobs across the screen.
 */
export function ShaderBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(el.clientWidth, el.clientHeight) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uColorA: { value: new THREE.Color(0x6366f1) }, // indigo
      uColorB: { value: new THREE.Color(0x8b5cf6) }, // violet
      uColorC: { value: new THREE.Color(0x10b981) }, // emerald accent
      uBg:     { value: new THREE.Color(0xf5f3ff) }, // canvas
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        uniform vec3 uBg;

        // Simplex-ish 2D noise (IQ-style hash)
        vec2 hash(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }
        float noise(vec2 p) {
          const float K1 = 0.366025404;
          const float K2 = 0.211324865;
          vec2 i = floor(p + (p.x + p.y) * K1);
          vec2 a = p - i + (i.x + i.y) * K2;
          vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec2 b = a - o + K2;
          vec2 c = a - 1.0 + 2.0 * K2;
          vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
          vec3 n = h * h * h * h *
            vec3(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
          return dot(n, vec3(70.0));
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
          }
          return v;
        }

        // Soft radial gradient at center c, radius r.
        float blob(vec2 uv, vec2 c, float r) {
          float d = distance(uv, c);
          return smoothstep(r, 0.0, d);
        }

        void main() {
          vec2 uv = vUv;
          float aspect = uResolution.x / uResolution.y;
          vec2 p = uv;
          p.x *= aspect;

          float t = uTime * 0.08;

          // warp space with low-frequency noise so blobs drift organically
          vec2 warp = vec2(
            fbm(p * 1.4 + vec2(t, t * 0.7)),
            fbm(p * 1.4 + vec2(-t * 0.8, t))
          );
          vec2 wp = p + warp * 0.35;

          // 3 moving blobs
          vec2 c1 = vec2(0.25 * aspect + 0.4 * sin(t * 1.3), 0.30 + 0.18 * cos(t * 1.1));
          vec2 c2 = vec2(0.85 * aspect + 0.30 * cos(t * 0.9), 0.75 + 0.20 * sin(t * 1.5));
          vec2 c3 = vec2(uMouse.x * aspect, 1.0 - uMouse.y);

          float b1 = blob(wp, c1, 0.55);
          float b2 = blob(wp, c2, 0.50);
          float b3 = blob(wp, c3, 0.30) * 0.55;

          vec3 col = uBg;
          col = mix(col, uColorA, b1 * 0.55);
          col = mix(col, uColorB, b2 * 0.55);
          col = mix(col, uColorC, b3 * 0.35);

          // soft vignette so edges keep brand canvas color
          float vig = smoothstep(1.2, 0.3, length(vUv - 0.5));
          col = mix(uBg, col, 0.30 + 0.55 * vig);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    let raf = 0;
    const start = performance.now();

    const tick = () => {
      uniforms.uTime.value = (performance.now() - start) * 0.001;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    if (!reduced) tick();
    else renderer.render(scene, camera);

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      uniforms.uMouse.value.x = (e.clientX - r.left) / r.width;
      uniforms.uMouse.value.y = (e.clientY - r.top) / r.height;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const onResize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      uniforms.uResolution.value.set(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 opacity-60"
    />
  );
}
