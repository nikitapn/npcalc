#version 300 es
precision mediump float;

in vec2 in_position;      // NDC coords: (-1,-1) to (1,1)
in vec2 in_texture_coord; // UV coords: (0,0) to (1,1)

out vec2 v_texcoord;

void main() {
  v_texcoord = in_texture_coord;
  gl_Position = vec4(in_position, 0.0, 1.0);
}
