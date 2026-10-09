import {build} from 'esbuild';
await build({entryPoints:['vendor/geometry-utils-entry.js'],bundle:true,format:'esm',minify:true,
  alias:{three:'/vendor/three.js'},external:['/vendor/three.js'],outfile:'public/vendor/geometry-utils.js'});
