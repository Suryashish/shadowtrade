"use client";

import { useEffect, useRef } from "react";
import {
  AmbientLight,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { COIN_DEFS, type CoinDef } from "./coins";

/*
 * A real 3D coin vortex: thick, lit discs travelling on two tilted rings. Coins lie tangent to
 * their ring (round at the front, edge-on at the sides, flat at the back), the depth buffer keeps
 * occlusion correct, and fog fades the far side into the page background.
 */

const COIN_RADIUS = 1;
const COIN_THICKNESS = 0.24;
const RING_TILT = 0.62; // radians the ring plane leans toward the viewer
const FOV = 30;
const TEXTURE_PX = 256;

/** rx: half-width across the screen; rz: half-depth (front to back), which tilts into the ellipse's height. */
type RingSpec = { rx: number; rz: number; count: number; speed: number; offset: Vector3; scale: number };

const RINGS_DESKTOP: RingSpec[] = [
  { rx: 14, rz: 14, count: 30, speed: 0.045, offset: new Vector3(0, 0, 0), scale: 1 },
  { rx: 9, rz: 9, count: 16, speed: -0.03, offset: new Vector3(0, 5.5, -12), scale: 0.85 },
];
const RINGS_PORTRAIT: RingSpec[] = [
  // Portrait: a narrower, deeper ring so it frames a tall column of text.
  { rx: 8.5, rz: 17, count: 24, speed: 0.04, offset: new Vector3(0, 0, 0), scale: 1 },
  { rx: 5.5, rz: 10, count: 12, speed: -0.03, offset: new Vector3(0, 6.5, -13), scale: 0.85 },
];

const WORLD_UP = new Vector3(0, 1, 0);

/** Deterministic PRNG so the coin mix is stable between visits. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function backgroundColor(el: HTMLElement) {
  return getComputedStyle(el).getPropertyValue("--l-bg").trim() || "#ffffff";
}

type FaceStyle = "solid" | "white";

function paintFace(c: HTMLCanvasElement, def: CoinDef, style: FaceStyle, fontFamily: string) {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  const r = TEXTURE_PX / 2;
  const fg = style === "solid" ? "#ffffff" : def.color;

  // Face with a soft radial sheen.
  const base = style === "solid" ? def.color : "#ffffff";
  const sheen = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  sheen.addColorStop(0, style === "solid" ? lighten(base, 0.18) : "#ffffff");
  sheen.addColorStop(0.75, style === "solid" ? base : "#f1f2f5");
  sheen.addColorStop(1, style === "solid" ? darken(base, 0.12) : "#d9dce3");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);

  // Bevelled outer edge so the face reads as minted metal, even white on white.
  ctx.beginPath();
  ctx.arc(r, r, r - TEXTURE_PX * 0.012, 0, Math.PI * 2);
  ctx.lineWidth = TEXTURE_PX * 0.024;
  ctx.strokeStyle = style === "solid" ? "rgba(0,0,0,0.18)" : "rgba(30,36,48,0.16)";
  ctx.stroke();

  // Minted inner ring.
  ctx.beginPath();
  ctx.arc(r, r, r * 0.82, 0, Math.PI * 2);
  ctx.lineWidth = TEXTURE_PX * 0.018;
  ctx.strokeStyle = style === "solid" ? "rgba(255,255,255,0.28)" : hexWithAlpha(def.color, 0.28);
  ctx.stroke();

  if (def.label) {
    const size = def.label.length <= 3 ? 0.34 : def.label.length === 4 ? 0.28 : 0.23;
    ctx.font = `800 ${Math.round(TEXTURE_PX * size)}px ${fontFamily}`;
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.label, r, r + TEXTURE_PX * 0.015);
  } else {
    // Ghost coins carry a geometric mark instead of a ticker.
    ctx.beginPath();
    ctx.arc(r, r, r * 0.34, 0, Math.PI * 2);
    ctx.lineWidth = TEXTURE_PX * 0.07;
    ctx.strokeStyle = fg;
    ctx.stroke();
  }
}

function faceTexture(def: CoinDef, style: FaceStyle, fontFamily: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = TEXTURE_PX;
  paintFace(c, def, style, fontFamily);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function lighten(hex: string, amount: number) {
  const c = new Color(hex);
  c.lerp(new Color("#ffffff"), amount);
  return `#${c.getHexString()}`;
}

function darken(hex: string, amount: number) {
  const c = new Color(hex);
  c.lerp(new Color("#000000"), amount);
  return `#${c.getHexString()}`;
}

function hexWithAlpha(hex: string, alpha: number) {
  const c = new Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
}

type Coin = { group: Group; ring: number; theta: number; phase: number };

export function CoinRing() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return; // No WebGL: the hero still reads fine without the ring.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 900ms ease";
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.add(new AmbientLight(0xffffff, 0.55));
    const key = new DirectionalLight(0xffffff, 1.5);
    key.position.set(6, 12, 14);
    scene.add(key);

    const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
    const fog = new Fog(new Color(backgroundColor(host)), 20, 60);
    scene.fog = fog;

    const portrait = host.clientWidth / Math.max(1, host.clientHeight) < 0.9;
    const specs = portrait ? RINGS_PORTRAIT : RINGS_DESKTOP;

    const disposables: { dispose: () => void }[] = [envTexture, pmrem];
    const faceGeo = new CircleGeometry(COIN_RADIUS, 64);
    const rimGeo = new CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_THICKNESS, 64, 1, true);
    rimGeo.rotateX(Math.PI / 2);
    disposables.push(faceGeo, rimGeo);

    const fontFamily = cssVar("--font-display", "system-ui, sans-serif");
    const faces: { tex: CanvasTexture; def: CoinDef; style: FaceStyle }[] = [];
    const materials = new Map<string, { face: Material; back: Material; rim: Material }>();
    // The inner (back) ring is drawn semi-transparent so it stays atmospheric behind the headline.
    const materialsFor = (def: CoinDef, style: FaceStyle, opacity: number) => {
      const id = `${def.id}:${style}:${opacity}`;
      const existing = materials.get(id);
      if (existing) return existing;
      const tex = faceTexture(def, style, fontFamily);
      faces.push({ tex, def, style });
      const rimColor = style === "solid" ? def.edge : "#b9bec8";
      const set = {
        face: new MeshStandardMaterial({ map: tex, roughness: 0.32, metalness: 0.05, envMapIntensity: 0.9, transparent: opacity < 1, opacity }),
        back: new MeshStandardMaterial({ color: style === "solid" ? def.color : "#e4e6eb", roughness: 0.4, envMapIntensity: 0.6, transparent: opacity < 1, opacity }),
        rim: new MeshStandardMaterial({ color: rimColor, roughness: 0.35, metalness: 0.15, envMapIntensity: 0.8, transparent: opacity < 1, opacity }),
      };
      disposables.push(tex, set.face, set.back, set.rim);
      materials.set(id, set);
      return set;
    };

    const rand = prng(7);
    const ringGroups = specs.map((spec) => {
      const g = new Group();
      g.position.copy(spec.offset);
      g.rotation.x = RING_TILT;
      scene.add(g);
      return g;
    });

    // Deal designs from shuffled decks so neighbouring coins never repeat.
    let deck: CoinDef[] = [];
    const nextDef = () => {
      if (deck.length === 0) {
        deck = [...COIN_DEFS];
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
      }
      return deck.pop()!;
    };

    const coins: Coin[] = [];
    specs.forEach((spec, ri) => {
      for (let i = 0; i < spec.count; i++) {
        const def = nextDef();
        const style: FaceStyle = def.style === "ghost" ? "white" : rand() < 0.35 ? (def.style === "solid" ? "white" : "solid") : def.style;
        const m = materialsFor(def, style, ri === 0 ? 1 : 0.42);
        const group = new Group();
        const face = new Mesh(faceGeo, m.face);
        face.position.z = COIN_THICKNESS / 2;
        const back = new Mesh(faceGeo, m.back);
        back.position.z = -COIN_THICKNESS / 2;
        back.rotation.y = Math.PI;
        group.add(face, back, new Mesh(rimGeo, m.rim));
        group.scale.setScalar(spec.scale * (0.92 + rand() * 0.16));
        ringGroups[ri].add(group);
        coins.push({ group, ring: ri, theta: (i / spec.count) * Math.PI * 2, phase: rand() * Math.PI * 2 });
      }
    });

    // Scratch objects reused every frame.
    const world = new Vector3();
    const toCamera = new Vector3();
    const radial = new Vector3();
    const normal = new Vector3();
    const up = new Vector3();
    const right = new Vector3();
    const basis = new Matrix4();
    const ringInverse = new Matrix4();
    const ringRotation = new Matrix4();

    const place = (coin: Coin, t: number) => {
      const spec = specs[coin.ring];
      const ring = ringGroups[coin.ring];
      const a = coin.theta + t * spec.speed;
      const bob = Math.sin(t * 0.8 + coin.phase) * 0.12;
      const rx = spec.rx * stretch;
      coin.group.position.set(Math.cos(a) * rx, bob, Math.sin(a) * spec.rz);

      // Orientation in world space: lie tangent to the ring, leaning toward the camera so faces read.
      coin.group.getWorldPosition(world);
      // Outward normal of the ellipse at this point.
      radial.set(Math.cos(a) * spec.rz, 0, Math.sin(a) * rx).normalize().transformDirection(ring.matrixWorld);
      toCamera.subVectors(camera.position, world).normalize();
      normal.copy(radial).multiplyScalar(0.62).addScaledVector(toCamera, 0.95).normalize();
      up.copy(WORLD_UP).addScaledVector(normal, -normal.dot(WORLD_UP));
      if (up.lengthSq() < 1e-4) up.set(0, 0, -1);
      up.normalize();
      right.crossVectors(up, normal).normalize();
      basis.makeBasis(right, up, normal);
      ringInverse.copy(ring.matrixWorld).invert();
      basis.premultiply(ringRotation.extractRotation(ringInverse));
      coin.group.quaternion.setFromRotationMatrix(basis);
    };

    // Wide screens get a wider ellipse, so the ring sweeps the viewport instead of hugging the centre.
    let stretch = 1;

    // Camera distance so the outer ring spans the viewport width (or fills a portrait screen's height).
    const fit = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      stretch = portrait ? 1 : Math.min(1.45, Math.max(1, camera.aspect / 1.55));
      const rx = specs[0].rx * stretch;
      const { rz } = specs[0];
      const tanHalf = Math.tan((FOV * Math.PI) / 360);
      // Width of the ring plus a coin either side; height of the tilted ellipse plus perspective growth up front.
      const byWidth = (rx * 2 + 2.6) / (2 * tanHalf * camera.aspect);
      const byHeight = (rz * 2 * Math.sin(RING_TILT) + 6.5) / (2 * tanHalf) / 0.94;
      // On portrait screens the ring is fitted to the height and may sweep past the sides.
      const distance = camera.aspect < 0.9 ? byHeight : Math.max(byWidth, byHeight);
      camera.position.set(0, 0.6, distance);
      // Aim below centre so the near arc (which perspective enlarges) stays inside the frame.
      camera.lookAt(0, -1.9, 0);
      camera.updateProjectionMatrix();
      fog.near = distance - 2;
      fog.far = distance + rz * 1.35;
    };
    fit();

    let pointerX = 0;
    let pointerY = 0;
    let tiltX = 0;
    let tiltY = 0;
    const onPointer = (e: PointerEvent) => {
      pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      pointerY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let t = 0;
    let shown = false;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      tiltX += (pointerY * 0.045 - tiltX) * 0.04;
      tiltY += (pointerX * 0.07 - tiltY) * 0.04;
      scene.rotation.set(tiltX, tiltY, 0);
      scene.updateMatrixWorld();
      for (const c of coins) place(c, t);
      renderer.render(scene, camera);
      if (!shown) {
        shown = true;
        renderer.domElement.style.opacity = "1";
      }
      if (visible && !reduceMotion) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    // Faces use the display font, so draw after it has loaded.
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      for (const f of faces) {
        paintFace(f.tex.image as HTMLCanvasElement, f.def, f.style, fontFamily);
        f.tex.needsUpdate = true;
      }
      start();
    });

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      if (visible && !reduceMotion) start();
      else cancelAnimationFrame(raf);
    });
    io.observe(host);
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible && !reduceMotion) start();
      else cancelAnimationFrame(raf);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const ro = new ResizeObserver(() => {
      fit();
      if (reduceMotion) start();
    });
    ro.observe(host);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      fog.color.set(backgroundColor(host));
      if (reduceMotion) start();
    };
    scheme.addEventListener("change", onScheme);
    if (!reduceMotion) window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scheme.removeEventListener("change", onScheme);
      window.removeEventListener("pointermove", onPointer);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0 z-0" />;
}
