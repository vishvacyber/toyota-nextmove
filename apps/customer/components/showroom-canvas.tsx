"use client";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Vector3 } from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import { offset, type Part } from "@/lib/showroom";

export type Hotspot = { part: Part; label: string; at: [number, number, number] };

const LIFT = -0.6; // the car group sits this far down so it's centered on the orbit target
const v = new Vector3();

/** Projects each hotspot's 3D anchor onto its DOM button every rendered frame. */
function TrackHotspots({ points, buttons }: { points: [number, number, number][]; buttons: RefObject<(HTMLButtonElement | null)[]> }) {
  useFrame(({ camera, size }) => {
    points.forEach((p, i) => {
      const el = buttons.current[i];
      if (!el) return;
      v.set(p[0], p[1] + LIFT, p[2]).project(camera);
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`;
      el.style.visibility = v.z < 1 ? "visible" : "hidden";
    });
  });
  return null;
}

/** The heavy half of the showroom (three + R3F), loaded only when the showroom opens. */
export default function ShowroomCanvas({ paint, explode, autoRotate, onInteract, hotspots, selected, onSelect }: {
  paint: string; explode: number; autoRotate: boolean; onInteract: () => void;
  hotspots: Hotspot[]; selected?: Part; onSelect: (p: Part) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // Render nothing while offscreen or in a background tab.
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); });
    io.observe(wrap.current!);
    document.addEventListener("visibilitychange", update);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  // "demand" renders only when something changes, so an idle, non-rotating scene costs no frames.
  const frameloop = !visible ? "never" : autoRotate ? "always" : "demand";
  const part = (p: Part, children: ReactNode) => <group position={offset(p, explode)}>{children}</group>;
  // Hotspots are plain DOM buttons over the canvas (keyboard + screen reader), positioned by TrackHotspots.
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const points = hotspots.map((h): [number, number, number] => {
    const [x, y, z] = offset(h.part, explode);
    return [h.at[0] + x, h.at[1] + y, h.at[2] + z];
  });

  return (
    <div ref={wrap} className="relative h-full w-full">
      <Canvas frameloop={frameloop} dpr={[1, 1.5]} camera={{ position: [7.2, 3.2, 7.2], fov: 38 }} gl={{ antialias: true }}>
        <color attach="background" args={["#f2f2f0"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 3]} intensity={1.2} />
        {/* Local lightformers instead of a preset HDR, so the studio light needs no network fetch. */}
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 4, 1]} />
          <Lightformer intensity={1.5} position={[-6, 2, 0]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} />
          <Lightformer intensity={1.5} position={[6, 2, 0]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
        </Environment>

        <group position={[0, LIFT, 0]}>
          {part("chassis", <>
            <mesh position={[0, 0.35, 0]}><boxGeometry args={[4.1, 0.12, 1.5]} /><meshStandardMaterial color="#3a3d42" metalness={0.6} roughness={0.5} /></mesh>
            {[[1.35, 0.8], [1.35, -0.8], [-1.35, 0.8], [-1.35, -0.8]].map(([x, z]) => (
              <mesh key={`${x}${z}`} position={[x, 0.36, z]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.36, 0.36, 0.26, 32]} /><meshStandardMaterial color="#111" roughness={0.8} />
              </mesh>
            ))}
          </>)}
          {part("battery", (
            <mesh position={[-0.2, 0.47, 0]}><boxGeometry args={[1.8, 0.1, 1.2]} /><meshStandardMaterial color="#2b6cb0" metalness={0.3} roughness={0.4} /></mesh>
          ))}
          {part("powertrain", <>
            <mesh position={[1.45, 0.75, 0]}><boxGeometry args={[0.8, 0.45, 1.0]} /><meshStandardMaterial color="#8a8f96" metalness={0.8} roughness={0.3} /></mesh>
            <mesh position={[1.45, 0.75, 0.62]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.2, 0.2, 0.25, 24]} /><meshStandardMaterial color="#c2410c" metalness={0.5} roughness={0.4} /></mesh>
          </>)}
          {part("interior", <>
            {[[0.1, 0.38], [0.1, -0.38], [-0.9, 0.38], [-0.9, -0.38]].map(([x, z]) => (
              <mesh key={`${x}${z}`} position={[x, 0.85, z]}><boxGeometry args={[0.5, 0.5, 0.5]} /><meshStandardMaterial color="#4b4f55" roughness={0.9} /></mesh>
            ))}
            <mesh position={[0.55, 1.05, 0.38]} rotation-y={Math.PI / 2}><torusGeometry args={[0.16, 0.03, 12, 32]} /><meshStandardMaterial color="#222" /></mesh>
          </>)}
          {part("body", <>
            <RoundedBox args={[4.4, 0.55, 1.8]} radius={0.2} position={[0, 0.85, 0]}>
              <meshPhysicalMaterial color={paint} metalness={0.6} roughness={0.25} clearcoat={1} clearcoatRoughness={0.1} />
            </RoundedBox>
            <RoundedBox args={[2.3, 0.55, 1.6]} radius={0.22} position={[-0.3, 1.35, 0]}>
              <meshPhysicalMaterial color="#1b2430" metalness={0.2} roughness={0.05} transparent opacity={0.85} />
            </RoundedBox>
          </>)}

        </group>

        <ContactShadows position={[0, LIFT, 0]} opacity={0.45} scale={10} blur={2.4} far={3} />
        <OrbitControls
          makeDefault
          autoRotate={autoRotate}
          autoRotateSpeed={0.8}
          enablePan={false}
          minDistance={4.5}
          maxDistance={14}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2 - 0.05}
          onStart={onInteract}
        />
        <TrackHotspots points={points} buttons={buttons} />
      </Canvas>
      {hotspots.map((h, i) => (
        <button
          key={h.part}
          ref={(el) => { buttons.current[i] = el; }}
          type="button"
          onClick={() => onSelect(h.part)}
          aria-label={h.label}
          aria-pressed={selected === h.part}
          title={h.label}
          className={`absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border-2 border-white text-lg font-bold shadow-lg transition-colors ${selected === h.part ? "bg-accent text-on-accent" : "bg-fg/80 text-bg hover:bg-accent"}`}
        >
          +
        </button>
      ))}
    </div>
  );
}
