import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { timeOfDayState } from '../game/timeOfDay';

// Crisp winter sky & daylight tint targets (zero per-frame allocations)
const WINTER_SKY_TOP = new THREE.Color('#6688b0');
const WINTER_SKY_MID = new THREE.Color('#b6cce0');
const WINTER_SKY_HORIZON = new THREE.Color('#dce8f2');
const WINTER_GROUND = new THREE.Color('#c8d4e0');
const WINTER_FOG = new THREE.Color('#d2e0ec');
const WINTER_HEMI_SKY = new THREE.Color('#d8e8f8');
const WINTER_HEMI_GROUND = new THREE.Color('#9fb0c2');
const WINTER_DIR_COL = new THREE.Color('#eef5ff');

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vSkyDirection;
  void main() {
    vSkyDirection = normalize(position);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uMidColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  uniform vec3 uMoonDirection;
  uniform float uMoonStrength;
  varying vec3 vSkyDirection;

  void main() {
    vec3 dir = normalize(vSkyDirection);
    float h = dir.y;

    vec3 sky;
    if (h >= 0.0) {
      float lowerMix = smoothstep(0.0, 0.24, h);
      float upperMix = smoothstep(0.18, 0.82, h);
      sky = mix(uHorizonColor, uMidColor, lowerMix);
      sky = mix(sky, uTopColor, upperMix);
    } else {
      float groundMix = smoothstep(0.0, -0.35, h);
      sky = mix(uHorizonColor, uGroundColor, groundMix);
    }

    // Sun halo & disc (fades out after twilight)
    float sunDot = max(dot(dir, normalize(uSunDirection)), 0.0);
    float sunGlow = pow(sunDot, 10.0) * 0.42;
    float sunHalo = pow(sunDot, 90.0) * 0.65;
    float sunDisc = smoothstep(0.9985, 0.9994, sunDot) * 1.4;

    // Pale silver-blue moon disc & soft atmospheric glow (fades in after dusk)
    float moonDot = max(dot(dir, normalize(uMoonDirection)), 0.0);
    float moonGlow = pow(moonDot, 18.0) * 0.26;
    float moonHalo = pow(moonDot, 140.0) * 0.55;
    float moonDisc = smoothstep(0.9991, 0.9995, moonDot) * 1.15;

    vec3 color = sky
      + uSunColor * (sunGlow + sunHalo + sunDisc) * uSunStrength
      + vec3(0.78, 0.87, 1.0) * (moonGlow + moonHalo + moonDisc) * uMoonStrength;

    gl_FragColor = vec4(color, 1.0);
  }
`;

interface SkyKeyframe {
  t: number;
  top: THREE.Color;
  mid: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  fog: THREE.Color;
  sunColor: THREE.Color;
  sunStrength: number;
  dirColor: THREE.Color;
  dirIntensity: number;
  dirPos: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  rimColor: THREE.Color;
  rimIntensity: number;
}

const KEYFRAMES: readonly SkyKeyframe[] = [
  {
    // 0.00: Den / Odpoledne (Bright warm late afternoon)
    t: 0.0,
    top: new THREE.Color('#3b73b5'),
    mid: new THREE.Color('#8bb8df'),
    horizon: new THREE.Color('#f0dfc4'),
    ground: new THREE.Color('#9e9580'),
    fog: new THREE.Color('#ddd6c5'),
    sunColor: new THREE.Color('#fff5d6'),
    sunStrength: 1.0,
    dirColor: new THREE.Color('#fff0cc'),
    dirIntensity: 2.85,
    dirPos: new THREE.Vector3(28, 30, 18),
    hemiSky: new THREE.Color('#dcecff'),
    hemiGround: new THREE.Color('#6a7363'),
    hemiIntensity: 1.05,
    rimColor: new THREE.Color('#a4c8f0'),
    rimIntensity: 0.45,
  },
  {
    // 0.35: Západ / Zlatá hodinka (Our classic Polička golden-hour sunset)
    t: 0.35,
    top: new THREE.Color('#274472'),
    mid: new THREE.Color('#c8826b'),
    horizon: new THREE.Color('#f7c38a'),
    ground: new THREE.Color('#8e7366'),
    fog: new THREE.Color('#e9b98c'),
    sunColor: new THREE.Color('#ffe4ad'),
    sunStrength: 1.0,
    dirColor: new THREE.Color('#ffcf8c'),
    dirIntensity: 2.55,
    dirPos: new THREE.Vector3(24, 14, 18),
    hemiSky: new THREE.Color('#ffd9a6'),
    hemiGround: new THREE.Color('#4b556b'),
    hemiIntensity: 0.85,
    rimColor: new THREE.Color('#8eb4e6'),
    rimIntensity: 0.5,
  },
  {
    // 0.70: Soumrak (Deep purple-indigo twilight with warm orange horizon)
    t: 0.7,
    top: new THREE.Color('#131b3a'),
    mid: new THREE.Color('#4d3560'),
    horizon: new THREE.Color('#c96f4b'),
    ground: new THREE.Color('#3c3144'),
    fog: new THREE.Color('#524063'),
    sunColor: new THREE.Color('#ff9452'),
    sunStrength: 0.55,
    dirColor: new THREE.Color('#e0937a'),
    dirIntensity: 1.25,
    dirPos: new THREE.Vector3(18, 6, 16),
    hemiSky: new THREE.Color('#867bb0'),
    hemiGround: new THREE.Color('#2a2d45'),
    hemiIntensity: 0.68,
    rimColor: new THREE.Color('#6c89c9'),
    rimIntensity: 0.52,
  },
  {
    // 1.00: Noc (Cozy, legible moonlit deep-blue night — never pitch black)
    t: 1.0,
    top: new THREE.Color('#091024'),
    mid: new THREE.Color('#14203d'),
    horizon: new THREE.Color('#253659'),
    ground: new THREE.Color('#172036'),
    fog: new THREE.Color('#1d2b4a'),
    sunColor: new THREE.Color('#5a6b94'),
    sunStrength: 0.0,
    dirColor: new THREE.Color('#9ebae8'),
    dirIntensity: 0.98,
    dirPos: new THREE.Vector3(-22, 24, -18),
    hemiSky: new THREE.Color('#647eb5'),
    hemiGround: new THREE.Color('#222a40'),
    hemiIntensity: 0.65,
    rimColor: new THREE.Color('#7090cc'),
    rimIntensity: 0.45,
  },
];

const MOON_DIR = new THREE.Vector3(-22, 24, -18).normalize();

export function Atmosphere() {
  const skyDomeRef = useRef<THREE.Mesh>(null);
  const starsRef = useRef<THREE.Points>(null);
  const starMatRef = useRef<THREE.PointsMaterial>(null);
  const bgColorRef = useRef<THREE.Color>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);

  const skyUniforms = useMemo(
    () => ({
      uTopColor: { value: new THREE.Color('#274472') },
      uMidColor: { value: new THREE.Color('#c8826b') },
      uHorizonColor: { value: new THREE.Color('#f7c38a') },
      uGroundColor: { value: new THREE.Color('#8e7366') },
      uSunDirection: { value: new THREE.Vector3(28, 15, 22).normalize() },
      uSunColor: { value: new THREE.Color('#ffe4ad') },
      uSunStrength: { value: 1.0 },
      uMoonDirection: { value: MOON_DIR.clone() },
      uMoonStrength: { value: 0.0 },
    }),
    [],
  );

  // Lightweight deterministic upper-hemisphere starfield (420 stars)
  const starGeometry = useMemo(() => {
    const count = 420;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    let seed = 1890;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const starTints = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#dbe8ff'),
      new THREE.Color('#fff2d6'),
      new THREE.Color('#c4d8ff'),
    ];
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      // Concentrate stars cleanly above the horizon (elevation 8° to 88°)
      const elev = 0.14 + Math.pow(rand(), 0.72) * (Math.PI * 0.43);
      const r = 1600;
      positions[i * 3] = Math.cos(elev) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.sin(elev) * r;
      positions[i * 3 + 2] = Math.cos(elev) * Math.sin(theta) * r;

      const c = starTints[i % starTints.length];
      const bright = 0.65 + rand() * 0.35;
      colors[i * 3] = c.r * bright;
      colors[i * 3 + 1] = c.g * bright;
      colors[i * 3 + 2] = c.b * bright;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  const sunDirScratchRef = useRef(new THREE.Vector3());

  useFrame(({ camera, clock }) => {
    // Keep sky dome & starfield centered on camera
    if (skyDomeRef.current) {
      skyDomeRef.current.position.copy(camera.position);
    }
    if (starsRef.current) {
      starsRef.current.position.copy(camera.position);
      starsRef.current.rotation.y = clock.getElapsedTime() * 0.0025;
    }

    const p = timeOfDayState.progress;

    // Locate surrounding keyframes
    let k0 = KEYFRAMES[0];
    let k1 = KEYFRAMES[KEYFRAMES.length - 1];
    for (let i = 0; i < KEYFRAMES.length - 1; i++) {
      if (p >= KEYFRAMES[i].t && p <= KEYFRAMES[i + 1].t) {
        k0 = KEYFRAMES[i];
        k1 = KEYFRAMES[i + 1];
        break;
      }
    }
    const span = Math.max(1e-4, k1.t - k0.t);
    const u = Math.max(0, Math.min(1, (p - k0.t) / span));

    skyUniforms.uTopColor.value.copy(k0.top).lerp(k1.top, u);
    skyUniforms.uMidColor.value.copy(k0.mid).lerp(k1.mid, u);
    skyUniforms.uHorizonColor.value.copy(k0.horizon).lerp(k1.horizon, u);
    skyUniforms.uGroundColor.value.copy(k0.ground).lerp(k1.ground, u);
    skyUniforms.uSunColor.value.copy(k0.sunColor).lerp(k1.sunColor, u);
    skyUniforms.uSunStrength.value = k0.sunStrength + (k1.sunStrength - k0.sunStrength) * u;
    skyUniforms.uMoonStrength.value = timeOfDayState.starFactor;

    // Subtle crisp winter cooling during daytime/sunset while keeping dusk/night warm lights cozy
    const winterDayWeight = timeOfDayState.isWinter ? Math.max(0, 1 - timeOfDayState.nightFactor * 0.72) : 0;
    if (winterDayWeight > 0.001) {
      skyUniforms.uTopColor.value.lerp(WINTER_SKY_TOP, winterDayWeight * 0.32);
      skyUniforms.uMidColor.value.lerp(WINTER_SKY_MID, winterDayWeight * 0.42);
      skyUniforms.uHorizonColor.value.lerp(WINTER_SKY_HORIZON, winterDayWeight * 0.48);
      skyUniforms.uGroundColor.value.lerp(WINTER_GROUND, winterDayWeight * 0.55);
    }

    const sunDir = sunDirScratchRef.current
      .copy(k0.dirPos)
      .lerp(k1.dirPos, u);
    skyUniforms.uSunDirection.value.copy(sunDir).normalize();

    if (bgColorRef.current) {
      bgColorRef.current.copy(k0.fog).lerp(k1.fog, u);
      if (winterDayWeight > 0.001) {
        bgColorRef.current.lerp(WINTER_FOG, winterDayWeight * 0.52);
      }
    }
    if (fogRef.current) {
      fogRef.current.color.copy(k0.fog).lerp(k1.fog, u);
      if (winterDayWeight > 0.001) {
        fogRef.current.color.lerp(WINTER_FOG, winterDayWeight * 0.52);
      }
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(k0.hemiSky).lerp(k1.hemiSky, u);
      hemiRef.current.groundColor.copy(k0.hemiGround).lerp(k1.hemiGround, u);
      if (winterDayWeight > 0.001) {
        hemiRef.current.color.lerp(WINTER_HEMI_SKY, winterDayWeight * 0.45);
        hemiRef.current.groundColor.lerp(WINTER_HEMI_GROUND, winterDayWeight * 0.55);
      }
      hemiRef.current.intensity = k0.hemiIntensity + (k1.hemiIntensity - k0.hemiIntensity) * u;
    }
    if (dirLightRef.current) {
      dirLightRef.current.position.copy(sunDir);
      dirLightRef.current.color.copy(k0.dirColor).lerp(k1.dirColor, u);
      if (winterDayWeight > 0.001) {
        dirLightRef.current.color.lerp(WINTER_DIR_COL, winterDayWeight * 0.42);
      }
      dirLightRef.current.intensity = k0.dirIntensity + (k1.dirIntensity - k0.dirIntensity) * u;
    }
    if (rimLightRef.current) {
      rimLightRef.current.color.copy(k0.rimColor).lerp(k1.rimColor, u);
      rimLightRef.current.intensity = k0.rimIntensity + (k1.rimIntensity - k0.rimIntensity) * u;
    }
    if (starMatRef.current && starsRef.current) {
      const sf = timeOfDayState.starFactor;
      starsRef.current.visible = sf > 0.01;
      const twinkle = 0.88 + 0.12 * Math.sin(clock.getElapsedTime() * 2.1);
      starMatRef.current.opacity = sf * 0.92 * twinkle;
    }
  });

  return (
    <>
      <color ref={bgColorRef} attach="background" args={['#e9b98c']} />
      <fog ref={fogRef} attach="fog" args={['#e9b98c', 280, 1150]} />

      {/* Camera-Centered Day-to-Night Sky Dome with Sun & Moon */}
      <mesh
        ref={skyDomeRef}
        name="sky-dome"
        scale={[1800, 1800, 1800]}
        renderOrder={-1000}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 32, 24]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          depthTest={false}
          fog={false}
          uniforms={skyUniforms}
          vertexShader={SKY_VERTEX_SHADER}
          fragmentShader={SKY_FRAGMENT_SHADER}
        />
      </mesh>

      {/* Lightweight Twinkling Night Starfield (depthTest: true so church & buildings cleanly occlude stars) */}
      <points
        ref={starsRef}
        geometry={starGeometry}
        visible={false}
        renderOrder={-1}
        frustumCulled={false}
      >
        <pointsMaterial
          ref={starMatRef}
          size={6.5}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={true}
          fog={false}
        />
      </points>

      {/* Hemisphere ambient bounce */}
      <hemisphereLight ref={hemiRef} args={['#ffd9a6', '#4b556b', 0.85]} />

      {/* Primary Directional Sun / Moon Light with Soft Shadows */}
      <directionalLight
        ref={dirLightRef}
        position={[24, 14, 18]}
        intensity={2.6}
        color="#ffcf8c"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={4}
        shadow-camera-far={70}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={14}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />

      {/* Secondary Sky Rim Fill Light */}
      <directionalLight
        ref={rimLightRef}
        position={[-18, 9, -16]}
        intensity={0.5}
        color="#8eb4e6"
      />

      {/* Subtle golden evening dust motes drifting around the gallery */}
      <Sparkles
        count={48}
        scale={[14, 4.5, 14]}
        position={[0, 2.2, 0]}
        size={2.2}
        speed={0.25}
        opacity={0.45}
        color="#ffe2a8"
      />
    </>
  );
}
