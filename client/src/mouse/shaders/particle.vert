#version 300 es
precision mediump float;

// Per-vertex attributes (shared quad)
in vec3 in_position;
in vec2 in_texture_coord;

// Per-instance attributes
in vec2 in_instance_position;  // particle position
in float in_instance_angle;     // rotation angle
in vec2 in_instance_scale;      // width, height
in vec4 in_instance_color;      // rgba
in vec2 in_instance_uv_offset;  // texture atlas UV offset

uniform vec2 u_screen_size;
uniform vec2 u_atlas_uv_scale;  // UV scale (e.g., 0.333 for 3 textures)

out vec2 v_texture_coord;
out vec4 v_color;

void main() {
  // Rotate and scale the vertex
  float c = cos(in_instance_angle);
  float s = sin(in_instance_angle);

  vec2 scaled_pos = in_position.xy * in_instance_scale;
  vec2 rotated_pos = vec2(
    scaled_pos.x * c - scaled_pos.y * s,
    scaled_pos.x * s + scaled_pos.y * c
  );

  // Translate to instance position
  vec2 world_pos = rotated_pos + in_instance_position;

  // Convert to NDC (no matrix multiplication needed for 2D!)
  vec2 ndc = (world_pos / u_screen_size) * 2.0 - 1.0;
  ndc.y = -ndc.y; // Flip Y for screen coordinates

  gl_Position = vec4(ndc, 0.0, 1.0);

  // Apply texture atlas offset to UVs
  v_texture_coord = in_texture_coord * u_atlas_uv_scale + in_instance_uv_offset;
  v_color = in_instance_color;
}
