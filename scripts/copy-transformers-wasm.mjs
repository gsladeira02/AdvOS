import { cp, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const source = join(process.cwd(), 'node_modules', '@huggingface', 'transformers', 'dist');
const target = join(process.cwd(), 'public', 'transformers');

try {
  const files = await readdir(source);
  const runtimeFiles = files.filter((name) => /^ort-wasm.*\.(?:wasm|mjs)$/i.test(name));
  await mkdir(target, { recursive: true });
  await Promise.all(runtimeFiles.map((name) => cp(join(source, name), join(target, name))));
  console.log(`[AdvOS] Transformers.js runtime local: ${runtimeFiles.length} arquivo(s) copiado(s).`);
} catch (error) {
  console.warn('[AdvOS] Não foi possível copiar o runtime local do Transformers.js:', error?.message || error);
}
