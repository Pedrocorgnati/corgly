// Loader das CLIs `ebooks:*` (tsx fora do bundler do Next).
// O registro do catalogo importa imagens estaticas (`import cover from './sales/cover.webp'`),
// que so o bundler do Next sabe ler. Aqui cada import de imagem vira um objeto no
// formato de StaticImageData (src, width, height reais), suficiente para o schema do
// catalogo; as CLIs nunca renderizam a imagem.
// O pacote nao declara "type": "module", entao o tsx carrega o catalogo como CommonJS
// e a imagem chega via require(). O handler de extensao do CommonJS existe em todo
// Node suportado (inclusive o node:20 do Dockerfile), sem depender de module hooks.
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { imageSize } = require('next/dist/compiled/image-size');

const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif'];

function loadImage(module, filename) {
  const { width, height } = imageSize(readFileSync(filename));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`ebooks-image-stub: dimensoes ilegiveis em ${filename}`);
  }
  const data = { src: filename, width, height };
  module.exports = { __esModule: true, default: data };
}

for (const ext of IMAGE_EXTENSIONS) Module._extensions[ext] = loadImage;
