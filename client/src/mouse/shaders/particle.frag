#version 300 es
precision mediump float;

in vec2 v_texture_coord;
in vec4 v_color;

uniform sampler2D u_sampler;

out vec4 fragColor;

void main() {
  vec4 tex_color = texture(u_sampler, v_texture_coord);
  fragColor = vec4(v_color.rgb, v_color.a * tex_color.a);
}
