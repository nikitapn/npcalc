#version 300 es
precision mediump float;

in vec2 v_texcoord;

uniform vec2 u_screen_size;
uniform sampler2D u_particles; // Particles from FBO
uniform float u_time;            // Time for twinkling animation

// Explosion positions and data
uniform vec2 u_explosion_positions[10];  // Screen-space positions
uniform vec3 u_explosion_colors[10];     // RGB colors
uniform float u_explosion_intensities[10]; // Brightness (0-1, fades over time)
uniform int u_explosion_count;           // How many active explosions

out vec4 fragColor;

// Hash function for procedural stars
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = v_texcoord;
    vec2 fragPos = uv * u_screen_size; // Convert to screen-space pixels
    // Y - is inverted in screen space
    fragPos.y = u_screen_size.y - fragPos.y;
    
    vec3 color = texture(u_particles, uv).rgb;

    // Tight bloom for particle glow
    vec3 bloom = vec3(0);
    float kernel_size = 5.0;
    for (float x = -kernel_size; x <= kernel_size; x++) {
        for (float y = -kernel_size; y <= kernel_size; y++) {
            vec2 offset = vec2(x, y) / u_screen_size;
            bloom += texture(u_particles, uv + offset).rgb;
        }
    }
    bloom /= pow(kernel_size * 2.0 + 1.0, 2.0);

    // RADIAL ILLUMINATION from explosion points (like full moon light)
    vec3 illumination = vec3(0);
    
    for (int i = 0; i < u_explosion_count && i < 10; i++) {
        vec2 toExplosion = u_explosion_positions[i] - fragPos;
        float dist = length(toExplosion);
        
        // Smooth radial falloff (like moonlight)
        float radius = u_screen_size.y * 2.0; // How far the light reaches (pixels)
        float normalizedDist = dist / radius;
        
        // Exponential falloff with smooth edge
        float falloff = exp(-normalizedDist * normalizedDist * 1.5);
        falloff *= smoothstep(1.0, 0.3, normalizedDist); // Gentle fade at edges
        
        // Add this explosion's contribution
        float intensity = u_explosion_intensities[i] * falloff;
        illumination += u_explosion_colors[i] * intensity;
    }

    // Combine: original + tight bloom + radial illumination
    color += bloom * 1.85;           // Tight bloom (existing)
    color += illumination * 0.2;     // Radial screen illumination (NEW)

    // STARS - procedural twinkling stars
    vec2 starCoord = fragPos / 30.0; // Star density (smaller = more stars)
    vec2 starId = floor(starCoord);
    vec2 starUv = fract(starCoord);
    
    float starHash = hash(starId);
    
    // Only some cells have stars (70% are empty)
    if (starHash > 0.3) {
        // Star position within cell (random offset)
        vec2 starPos = vec2(hash(starId + 1.0), hash(starId + 2.0));
        float distToStar = length(starUv - starPos);
        
        // Star brightness (varies per star)
        float brightness = hash(starId + 3.0) * 0.8 + 0.2;
        
        // Twinkle effect - each star twinkles at different rate and phase
        float twinkleSpeed = hash(starId + 4.0) * 2.0 + 1.0; // 1-3x speed
        float twinklePhase = hash(starId + 5.0) * 6.28;      // Random phase offset
        float twinkle = sin(u_time * twinkleSpeed + twinklePhase) * 0.3 + 0.7; // 0.4 to 1.0
        
        // Star glow
        float star = exp(-distToStar * 50.0) * brightness * twinkle;
        star = smoothstep(0.0, 0.3, star);
        
        // Add star color (slight blue tint for distant stars)
        vec3 starColor = vec3(0.9, 0.95, 1.0);
        color += starColor * star * 0.3;
    }

    fragColor = vec4(color, 1.0);
}