import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';

const copyAssets = async () => {
  const assets = [
    {
      src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
      dest: 'dist/'
    },
    {
      src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx',
      dest: 'dist/'
    },
    {
      src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
      dest: 'dist/'
    }
  ];

  // Copy the files that don't use wildcards directly
  try {
    for (const asset of assets) {
      const srcPath = path.resolve(asset.src);
      const destPath = path.resolve(asset.dest, path.basename(asset.src));

      if (fs.existsSync(srcPath)) {
        await fs.copy(srcPath, destPath);
        console.log(`Copied ${srcPath} to ${destPath}`);
      } else {
        console.error(`Source file ${srcPath} not found!`);
      }
    }

    // Handle the wasm files using glob
    const wasmFiles = glob.sync('node_modules/onnxruntime-web/dist/*.wasm');
    for (const wasmFile of wasmFiles) {
      const destPath = path.resolve('dist', path.basename(wasmFile));
      await fs.copy(wasmFile, destPath);
      console.log(`Copied ${wasmFile} to ${destPath}`);
    }

  } catch (err) {
    console.error('Error during asset copying:', err);
  }
};

copyAssets();
