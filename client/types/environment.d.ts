// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

declare global {
	namespace NodeJS {
	  interface ProcessEnv {
		NODE_ENV: 'development' | 'production';
	  }
	}
  }
  
  // If this file has no import/export statements (i.e. is a script)
  // convert it into a module by adding an empty export statement.
  export {}