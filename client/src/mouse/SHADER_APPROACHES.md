// Hybrid Fireworks Rendering Strategy

## Phase 1: Add Post-Processing (Easy Win!)

### Step 1: Render to Framebuffer
Instead of rendering directly to screen:
```typescript
// Create offscreen framebuffer
const fbo = gl.createFramebuffer();
const texture = gl.createTexture();
// ... setup texture as render target

// Render particles to FBO
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
the_particle_renderer.render();

// Now particles are in 'texture'
```

### Step 2: Apply Bloom Shader
```glsl
// bloom.frag - Fullscreen pass
#version 300 es
precision mediump float;

in vec2 v_texcoord;
uniform sampler2D u_particles; // Particles from FBO
out vec4 fragColor;

void main() {
    vec2 uv = v_texcoord;
    vec3 color = texture(u_particles, uv).rgb;
    
    // Simple box blur for glow
    vec3 bloom = vec3(0);
    float kernel_size = 5.0;
    for (float x = -kernel_size; x <= kernel_size; x++) {
        for (float y = -kernel_size; y <= kernel_size; y++) {
            vec2 offset = vec2(x, y) / vec2(1920, 1080); // Screen size
            bloom += texture(u_particles, uv + offset).rgb;
        }
    }
    bloom /= pow(kernel_size * 2.0 + 1.0, 2.0);
    
    // Combine original + bloom
    color += bloom * 0.8; // Bloom strength
    
    fragColor = vec4(color, 1.0);
}
```

**Result:** Your particles now glow! ✨

---

## Phase 2: Better Particle Rendering (More Work)

### Option A: GPU Particles with Fullscreen Shader
```typescript
// Store particles in texture (GPU-side)
const particleData = new Float32Array(MAX_PARTICLES * 4);
// [x, y, vx, vy] per particle

// Update shader computes new positions
// Render shader draws with effects
```

### Option B: Particle Sprites with Better Textures

Instead of simple dot, use:
- **Radial gradient** with HDR values (>1.0 for bloom)
- **Star texture** with rays
- **Procedural texture** generated in shader

Example:
```glsl
// particle.frag
float star(vec2 uv) {
    float angle = atan(uv.y, uv.x);
    float dist = length(uv);
    
    // 8-pointed star
    float star = sin(angle * 8.0) * 0.3 + 0.7;
    float falloff = 1.0 / (dist + 0.1);
    
    return star * falloff;
}

void main() {
    vec2 uv = v_texture_coord * 2.0 - 1.0; // -1 to 1
    float intensity = star(uv);
    
    vec3 color = v_color.rgb * intensity * 3.0; // HDR (>1.0)
    fragColor = vec4(color, v_color.a * intensity);
}
```

---

## Quick Win: Upgrade Your Fragment Shader

**Current** (simple):
```glsl
vec4 tex_color = texture(u_sampler, v_texture_coord);
fragColor = vec4(vec3(v_color), v_color.a * tex_color.a);
```

**Better** (with glow):
```glsl
vec2 uv = v_texture_coord * 2.0 - 1.0; // Center
float dist = length(uv);

// Soft glow
float core = 1.0 - smoothstep(0.0, 0.3, dist);
float glow = 1.0 - smoothstep(0.0, 1.0, dist);

// HDR color (>1.0 for bloom)
vec3 color = v_color.rgb * (core * 2.0 + glow * 0.5);
float alpha = v_color.a * glow;

fragColor = vec4(color, alpha);
```

This alone will make your particles look much better!

---

## Comparison

| Approach | Pros | Cons |
|----------|------|------|
| **Your Current** | Fast, many particles | Basic look, no effects |
| **+ Post-Process** | Easy to add, big visual gain | Extra render pass |
| **Fullscreen Shader** | Most flexible, amazing effects | Complex, fewer particles |
| **Hybrid** | Best quality + performance | More code |

---

## My Recommendation

1. **Immediate (5 min):** Upgrade your fragment shader (above)
2. **Next (30 min):** Add bloom post-processing pass
3. **Later:** Experiment with fullscreen if you want crazy effects

ShaderToy is great for learning, but **you don't need fullscreen rendering** to get impressive fireworks. Post-processing bloom on your existing particles will make them look 10× better!

Want me to implement the bloom post-processing pass for you?
