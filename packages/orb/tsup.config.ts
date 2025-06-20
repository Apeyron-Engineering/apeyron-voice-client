import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  // Gestisce gli asset audio
  loader: {
    '.wav': 'copy',
    '.mp3': 'copy',
    '.ogg': 'copy'
  },
  // Copia gli asset nella dist
  onSuccess: 'cp -r src/assets dist/'
}) 