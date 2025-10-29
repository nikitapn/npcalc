// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

import { gl } from 'mouse/gl'
import { GLResourses, Texture } from './texture'

var OBJ = require('webgl-obj-loader');

export class Model {
	objectFile: string;
	mesh: any;
	meshLoaded: boolean;
	texture: Texture;

	constructor(objectFile: string, textureFile: string) {
		this.objectFile = objectFile;
		this.mesh = null;
		this.meshLoaded = false;
		this.texture = GLResourses.loadTexture(textureFile);
		fetch(objectFile)
			.then(async function (response: Response) {
				let obj = await response.text();
				let mesh = new OBJ.Mesh(obj);
				OBJ.initMeshBuffers(gl, mesh);
				this.mesh = mesh;
				this.meshLoaded = true;
			}.bind(this))
			.catch((error) => {
				console.error('Error:', error);
			});
	}
}

