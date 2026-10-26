"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const MODEL = "/models/chest.glb";
const COINS = 46;
const OPEN_AT = 0.35; // seconds before the lid starts to move
const SPILL_AT = 1.15; // seconds: coins burst once the lid is well open
const SETTLED = 7; // seconds: after this the scene is still, so it stops drawing (battery)

/**
 * The finale (T-604, DESIGN.md › Motion): the Blender chest (T-603) on the phone or projector. The lid opens, light
 * swells from inside, god rays fade in and gold coins spill over the rim and bounce. Loaded only on the Victory
 * screen; reduced motion and phones without WebGL get the still image instead (see ChestStage).
 */
export default function ChestFinale() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [1.9, 1.55, 2.9], fov: 34, near: 0.1, far: 30 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.42, 0)}
    >
      <ambientLight intensity={0.6} color="#ffe6c0" />
      <directionalLight position={[2, 3, 2]} intensity={2.4} color="#ffd9a0" />
      <directionalLight position={[-2, 2, -2]} intensity={0.9} color="#9fb4ff" />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}

function Scene() {
  const gltf = useLoader(GLTFLoader, MODEL);
  const mixer = useMemo(() => new THREE.AnimationMixer(gltf.scene), [gltf]);
  const glow = useRef<THREE.PointLight>(null);
  const rays = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const { invalidate, gl, scene } = useThree();

  // Metal and gold need something to reflect: a small generated room, made once (no image download).
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    const clip = gltf.animations[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = 1.2;
    const id = setTimeout(() => action.play(), OPEN_AT * 1000);
    return () => clearTimeout(id);
  }, [gltf, mixer]);

  useFrame(({ clock }, dt) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    mixer.update(Math.min(dt, 0.05));
    const open = THREE.MathUtils.smoothstep(t, OPEN_AT, OPEN_AT + 1.6);
    if (glow.current) glow.current.intensity = 0.2 + open * 7;
    if (rays.current) {
      rays.current.rotation.y = t * 0.12;
      rays.current.children.forEach((r, i) => {
        const m = (r as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = open * (0.16 + 0.06 * Math.sin(t * 1.3 + i));
      });
    }
    // Keep drawing while anything moves; the rays' slow turn alone isn't worth a phone's battery.
    if (t < SETTLED) invalidate();
  });

  return (
    <group>
      <primitive object={gltf.scene} />
      <pointLight ref={glow} position={[0, 0.62, 0]} distance={3} decay={1.6} color="#ffbf55" intensity={0.2} />
      <GodRays group={rays} />
      <CoinSpill />
    </group>
  );
}

/** Soft shafts of light rising from the open chest (additive, no post-processing: cheap on phones). */
function GodRays({ group }: { group: React.RefObject<THREE.Group | null> }) {
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.42, 2.6, 24, 1, true);
    g.translate(0, -1.3, 0);
    g.rotateX(Math.PI);
    return g;
  }, []);
  const tilts = [-0.22, -0.08, 0.06, 0.2, 0.32];
  return (
    <group ref={group} position={[0, 0.5, 0]}>
      {tilts.map((z, i) => (
        <mesh key={i} geometry={geo} rotation={[0.05 * (i - 2), (i * Math.PI) / 2.5, z]} scale={[0.5 + i * 0.07, 1, 0.5]}>
          <meshBasicMaterial
            color="#ffe2a0"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Gold coins burst out over the rim, fall and bounce on the floor, then settle. */
function CoinSpill() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const born = useRef<number | null>(null);
  const coins = useMemo(
    () =>
      Array.from({ length: COINS }, (_, i) => {
        const a = (i / COINS) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 0.7 + Math.random() * 0.9;
        return {
          p: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.55, (Math.random() - 0.5) * 0.3),
          v: new THREE.Vector3(Math.cos(a) * speed * 0.6, 1.6 + Math.random() * 1.2, Math.sin(a) * speed * 0.6 + 0.35),
          r: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
          spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
          delay: Math.random() * 0.5,
        };
      }),
    [],
  );
  const geo = useMemo(() => new THREE.CylinderGeometry(0.032, 0.032, 0.007, 16), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e3a83a", metalness: 1, roughness: 0.2 }), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const hidden = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (born.current === null) born.current = clock.elapsedTime;
    const t = clock.elapsedTime - born.current - SPILL_AT;
    const step = Math.min(dt, 0.033);
    coins.forEach((c, i) => {
      const live = t > c.delay;
      if (live) {
        c.v.y -= 9.8 * step;
        c.p.addScaledVector(c.v, step);
        if (c.p.y < 0.004) {
          c.p.y = 0.004;
          c.v.y = Math.abs(c.v.y) * 0.35;
          c.v.x *= 0.6;
          c.v.z *= 0.6;
          c.spin.multiplyScalar(0.6);
        }
        c.r.x += c.spin.x * step;
        c.r.y += c.spin.y * step;
        c.r.z += c.spin.z * step;
      }
      q.setFromEuler(c.r);
      m4.compose(c.p, q, live ? one : hidden);
      m.setMatrixAt(i, m4);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, COINS]} frustumCulled={false} />;
}
