#version 300 es
precision mediump float;

// particle.frag - Enhanced version with procedural noise

in vec2 v_texture_coord;  // Atlas UV (for texture sampling)
in vec2 v_local_uv;       // Local UV (0-1, for radial effects)
in vec4 v_color;
in float v_age;
in float v_glow_intensity;
in float v_glow_radius;

out vec4 fragColor;

// Hash function for procedural randomness
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// 2D Value Noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // Smoothstep interpolation
  
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal Brownian Motion (layered noise)
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  
  for(int i = 0; i < 4; i++) {
    value += amplitude * noise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  
  return value;
}

// Turbulence (creates churning, fire-like patterns)
float turbulence(vec2 p) {
  float t = 0.0;
  float amplitude = 1.0;
  
  for(int i = 0; i < 3; i++) {
    t += amplitude * abs(noise(p));
    p *= 2.0;
    amplitude *= 0.5;
  }
  
  return t;
}

void main() {
  // Use local UV (0-1) for radial effects, not atlas UV!
  vec2 center = v_local_uv - 0.5;
  float dist = length(center) * 2.0 / v_glow_radius; // Scale by radius parameter
  
  // Angular coordinate for radial noise patterns
  float angle = atan(center.y, center.x);

  // PROCEDURAL NOISE - breaks up the perfect circle
  // Use particle position (via texture coord) as noise seed for variation
  vec2 noiseCoord = v_local_uv * 6.0 + v_texture_coord * 10.0;
  
  // Method 1: Radial turbulence (creates irregular, flame-like edges)
  float radialNoise = turbulence(noiseCoord + vec2(angle * 2.0, dist * 3.0));
  radialNoise = radialNoise * 0.3 + 0.7; // Range: 0.7 to 1.0
  
  // Method 2: Angular distortion (makes edges wavy/spiky)
  float angularNoise = noise(vec2(angle * 8.0, v_age * 2.0)) * 0.15;
  float distortedDist = dist + angularNoise;
  
  // Method 3: Cellular/cloud-like patterns for organic feel
  float cloudNoise = fbm(noiseCoord * 2.0);
  
  // Apply noise to distance for irregular explosion shape
  float noisyDist = distortedDist * radialNoise;

  // PROCEDURAL GLOW with smooth falloff to zero
  
  // Hot core - very bright center (with subtle noise)
  float coreGlow = exp(-noisyDist * noisyDist * 3.0);  
  coreGlow *= (0.8 + cloudNoise * 0.2); // Add subtle texture
  
  // Extended glow - reaches far with smooth fade
  float extendedGlow = exp(-noisyDist * 0.8);  
  extendedGlow *= smoothstep(1.0, 0.5, noisyDist);  
  extendedGlow *= radialNoise; // Make edges irregular
  
  // FLASH EFFECT: Extremely bright at birth (age near 0)
  float flash = 1.0 / (0.01 + v_age);
  flash = clamp(flash * 0.2, 0.0, 10.0);
  flash *= exp(-noisyDist * noisyDist);  
  flash *= (0.9 + turbulence(noiseCoord * 3.0) * 0.1); // Turbulent flash

  // Sparkle (subtle, noise-driven)
  float sparkle = step(0.95, cloudNoise) * (1.0 - v_age) * 0.5;

  // Combine all effects (scaled by glow intensity parameter)
  float intensity = (coreGlow + extendedGlow * 0.6 + flash * 0.35 + sparkle) * v_glow_intensity;
  
  // Natural irregular fade with noise-based alpha erosion
  float alphaErosion = smoothstep(0.3, 0.7, cloudNoise + (1.0 - v_age) * 0.5);

  vec3 color = v_color.rgb * intensity;
  float alpha = v_color.a * intensity * alphaErosion;

  fragColor = vec4(color, alpha);
}
