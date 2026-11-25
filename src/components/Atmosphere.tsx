import { useMemo } from 'react';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';

const SUN_DIRECTION = new THREE.Vector3(28, 15, 22).normalize();

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDirection;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz);
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
  varying vec3 vWorldDirection;

  void main() {
    vec3 dir = normalize(vWorldDirection);
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

    // Soft golden-hour sun halo and disc
    float sunDot = max(dot(dir, normalize(uSunDirection)), 0.0);
    float sunGlow = pow(sunDot, 10.0) * 0.42;
    float sunHalo = pow(sunDot, 90.0) * 0.65;
    float sunDisc = smoothstep(0.9985, 0.9994, sunDot) * 1.4;

    vec3 color = sky + uSunColor * (sunGlow + sunHalo + sunDisc);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function Atmosphere() {
  const skyUniforms = useMemo(
    () => ({
      uTopColor: { value: new THREE.Color('#274472') },
      uMidColor: { value: new THREE.Color('#c8826b') },
      uHorizonColor: { value: new THREE.Color('#f7c38a') },
      uGroundColor: { value: new THREE.Color('#8e7366') },
      uSunDirection: { value: SUN_DIRECTION },
      uSunColor: { value: new THREE.Color('#ffe4ad') },
    }),
    [],
  );

  return (
    <>
      {/* Background fallback & subtle golden-hour atmospheric distance fog */}
      <color attach="background" args={['#e9b98c']} />
      <fog attach="fog" args={['#e9b98c', 95, 420]} />

      {/* Custom Golden-Hour Sky Dome */}
      <mesh name="sky-dome" scale={[650, 650, 650]} frustumCulled={false}>
        <sphereGeometry args={[1, 32, 24]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
          uniforms={skyUniforms}
          vertexShader={SKY_VERTEX_SHADER}
          fragmentShader={SKY_FRAGMENT_SHADER}
        />
      </mesh>

      {/* Hemisphere ambient bounce: warm golden sky above, muted slate shadow below */}
      <hemisphereLight args={['#ffd9a6', '#4b556b', 0.85]} />

      {/* Primary Golden-Hour Directional Sun with Soft Shadows */}
      <directionalLight
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

      {/* Cool twilight rim/fill light from the opposite sky quadrant */}
      <directionalLight
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
