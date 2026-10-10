// @ts-check
"use strict";

/**
 * Pure JavaScript, zero-dependency QR Code (Model 2) encoder and SVG generator.
 * Implements ISO/IEC 18004 QR specification (Byte mode, Error Correction Levels L/M/Q/H,
 * Reed-Solomon polynomial math over GF(2^8), standard alignment patterns, BCH masking).
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
let seed = 1;
for (let i = 0; i < 255; i++) {
  EXP[i] = seed;
  EXP[i + 255] = seed;
  LOG[seed] = i;
  seed <<= 1;
  if (seed & 256) seed ^= 0x11d;
}

/**
 * Multiply two elements in Galois Field GF(2^8).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/**
 * Generate Reed-Solomon generator polynomial coefficients for k error correction codewords.
 * @param {number} k
 * @returns {number[]}
 */
function rsGen(k) {
  let poly = [1];
  for (let i = 0; i < k; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/**
 * Compute Reed-Solomon error correction codewords for a data block.
 * @param {Uint8Array} data
 * @param {number} k
 * @returns {Uint8Array}
 */
function rsEncode(data, k) {
  const gen = rsGen(k);
  const rem = new Uint8Array(k);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < k - 1; j++) {
      rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    rem[k - 1] = gfMul(gen[k], factor);
  }
  return rem;
}

/**
 * Calculate 15-bit format information with 10-bit BCH error correction code.
 * @param {number} ecLevel 0 = M, 1 = L, 2 = H, 3 = Q
 * @param {number} mask 0..7
 * @returns {number}
 */
function getFormatBits(ecLevel, mask) {
  const data = (ecLevel << 3) | mask;
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) {
    if ((rem >> (i + 10)) & 1) rem ^= 0x537 << i;
  }
  return ((data << 10) | rem) ^ 0x5412;
}

/**
 * Calculate 18-bit version information with 12-bit BCH error correction code (versions >= 7).
 * @param {number} version
 * @returns {number}
 */
function getVersionBits(version) {
  let rem = version << 12;
  for (let i = 5; i >= 0; i--) {
    if ((rem >> (i + 12)) & 1) rem ^= 0x1f25 << i;
  }
  return (version << 12) | rem;
}

/**
 * QR Code Model 2 capacity and block layout table for versions 1 to 10.
 * Format: { v, size, rem, L, M, Q, H, align }
 * dc = total data codewords, ec = ec codewords per block, b1 = block 1 count, b1_dc = block 1 data codewords...
 */
const QR_TABLE = [
  null,
  {
    v: 1,
    size: 21,
    rem: 0,
    L: { dc: 19, ec: 7, b1: 1, b1_dc: 19, b2: 0, b2_dc: 0 },
    M: { dc: 16, ec: 10, b1: 1, b1_dc: 16, b2: 0, b2_dc: 0 },
    Q: { dc: 13, ec: 13, b1: 1, b1_dc: 13, b2: 0, b2_dc: 0 },
    H: { dc: 9, ec: 17, b1: 1, b1_dc: 9, b2: 0, b2_dc: 0 },
    align: [],
  },
  {
    v: 2,
    size: 25,
    rem: 7,
    L: { dc: 34, ec: 10, b1: 1, b1_dc: 34, b2: 0, b2_dc: 0 },
    M: { dc: 28, ec: 16, b1: 1, b1_dc: 28, b2: 0, b2_dc: 0 },
    Q: { dc: 22, ec: 22, b1: 1, b1_dc: 22, b2: 0, b2_dc: 0 },
    H: { dc: 16, ec: 28, b1: 1, b1_dc: 16, b2: 0, b2_dc: 0 },
    align: [6, 18],
  },
  {
    v: 3,
    size: 29,
    rem: 7,
    L: { dc: 55, ec: 15, b1: 1, b1_dc: 55, b2: 0, b2_dc: 0 },
    M: { dc: 44, ec: 26, b1: 1, b1_dc: 44, b2: 0, b2_dc: 0 },
    Q: { dc: 34, ec: 18, b1: 2, b1_dc: 17, b2: 0, b2_dc: 0 },
    H: { dc: 26, ec: 22, b1: 2, b1_dc: 13, b2: 0, b2_dc: 0 },
    align: [6, 22],
  },
  {
    v: 4,
    size: 33,
    rem: 7,
    L: { dc: 80, ec: 20, b1: 1, b1_dc: 80, b2: 0, b2_dc: 0 },
    M: { dc: 64, ec: 18, b1: 2, b1_dc: 32, b2: 0, b2_dc: 0 },
    Q: { dc: 48, ec: 26, b1: 2, b1_dc: 24, b2: 0, b2_dc: 0 },
    H: { dc: 36, ec: 16, b1: 4, b1_dc: 9, b2: 0, b2_dc: 0 },
    align: [6, 26],
  },
  {
    v: 5,
    size: 37,
    rem: 7,
    L: { dc: 108, ec: 26, b1: 1, b1_dc: 108, b2: 0, b2_dc: 0 },
    M: { dc: 86, ec: 24, b1: 2, b1_dc: 43, b2: 0, b2_dc: 0 },
    Q: { dc: 62, ec: 18, b1: 2, b1_dc: 15, b2: 2, b2_dc: 16 },
    H: { dc: 46, ec: 22, b1: 2, b1_dc: 11, b2: 2, b2_dc: 12 },
    align: [6, 30],
  },
  {
    v: 6,
    size: 41,
    rem: 7,
    L: { dc: 136, ec: 18, b1: 2, b1_dc: 68, b2: 0, b2_dc: 0 },
    M: { dc: 108, ec: 16, b1: 4, b1_dc: 27, b2: 0, b2_dc: 0 },
    Q: { dc: 76, ec: 24, b1: 4, b1_dc: 19, b2: 0, b2_dc: 0 },
    H: { dc: 60, ec: 28, b1: 4, b1_dc: 15, b2: 0, b2_dc: 0 },
    align: [6, 34],
  },
  {
    v: 7,
    size: 45,
    rem: 0,
    L: { dc: 156, ec: 20, b1: 2, b1_dc: 78, b2: 0, b2_dc: 0 },
    M: { dc: 124, ec: 18, b1: 4, b1_dc: 31, b2: 0, b2_dc: 0 },
    Q: { dc: 88, ec: 18, b1: 2, b1_dc: 14, b2: 4, b2_dc: 15 },
    H: { dc: 66, ec: 26, b1: 4, b1_dc: 13, b2: 1, b2_dc: 14 },
    align: [6, 22, 38],
  },
  {
    v: 8,
    size: 49,
    rem: 0,
    L: { dc: 194, ec: 24, b1: 2, b1_dc: 97, b2: 0, b2_dc: 0 },
    M: { dc: 154, ec: 22, b1: 2, b1_dc: 38, b2: 2, b2_dc: 39 },
    Q: { dc: 110, ec: 22, b1: 4, b1_dc: 18, b2: 2, b2_dc: 19 },
    H: { dc: 86, ec: 26, b1: 4, b1_dc: 14, b2: 2, b2_dc: 15 },
    align: [6, 24, 42],
  },
  {
    v: 9,
    size: 53,
    rem: 0,
    L: { dc: 232, ec: 30, b1: 2, b1_dc: 116, b2: 0, b2_dc: 0 },
    M: { dc: 182, ec: 22, b1: 3, b1_dc: 36, b2: 2, b2_dc: 37 },
    Q: { dc: 132, ec: 20, b1: 4, b1_dc: 16, b2: 4, b2_dc: 17 },
    H: { dc: 100, ec: 24, b1: 4, b1_dc: 12, b2: 4, b2_dc: 13 },
    align: [6, 26, 46],
  },
  {
    v: 10,
    size: 57,
    rem: 0,
    L: { dc: 274, ec: 18, b1: 2, b1_dc: 68, b2: 2, b2_dc: 69 },
    M: { dc: 216, ec: 26, b1: 4, b1_dc: 43, b2: 1, b2_dc: 44 },
    Q: { dc: 154, ec: 24, b1: 6, b1_dc: 19, b2: 2, b2_dc: 20 },
    H: { dc: 122, ec: 28, b1: 6, b1_dc: 15, b2: 2, b2_dc: 16 },
    align: [6, 28, 50],
  },
];

/**
 * Creates a boolean matrix (true = dark, false = light) for the given text.
 * @param {string} text
 * @param {{ ecLevel?: "L" | "M" | "Q" | "H" }} [options]
 * @returns {boolean[][]}
 */
function createQrMatrix(text, { ecLevel = "M" } = {}) {
  const data = Buffer.from(text, "utf8");
  let version = 0;
  let spec = null;
  let entry = null;

  for (let v = 1; v <= 10; v++) {
    const e = QR_TABLE[v];
    if (!e) continue;
    const s = e[ecLevel];
    const countBits = v <= 9 ? 8 : 16;
    const maxBytes = Math.floor((s.dc * 8 - (4 + countBits)) / 8);
    if (data.length <= maxBytes) {
      version = v;
      spec = s;
      entry = e;
      break;
    }
  }

  if (!version || !spec || !entry) {
    throw new Error(
      "Texto demasiado largo para el generador QR (máximo admitido: 216 bytes)",
    );
  }

  // 1. Bitstream assembly (Byte mode: 0100)
  const bits = [];
  /** @param {number} val @param {number} len */
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  }

  pushBits(4, 4); // Byte mode indicator
  pushBits(data.length, version <= 9 ? 8 : 16); // Character count indicator
  for (const b of data) pushBits(b, 8); // Data bytes

  // Terminator (up to 4 bits)
  const totalDataBits = spec.dc * 8;
  const termLen = Math.min(4, totalDataBits - bits.length);
  pushBits(0, termLen);

  // Pad to multiple of 8
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes alternating 0xEC (236) and 0x11 (17)
  let padByte = 0xec;
  while (bits.length < totalDataBits) {
    pushBits(padByte, 8);
    padByte = padByte === 0xec ? 0x11 : 0xec;
  }

  // Convert bits to data codewords
  const dataCodewords = new Uint8Array(spec.dc);
  for (let i = 0; i < spec.dc; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    dataCodewords[i] = b;
  }

  // Split into blocks and compute Reed-Solomon EC
  const totalBlocks = spec.b1 + spec.b2;
  /** @type {{ data: Uint8Array, ec: Uint8Array }[]} */
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < spec.b1; i++) {
    const slice = dataCodewords.slice(offset, offset + spec.b1_dc);
    blocks.push({ data: slice, ec: rsEncode(slice, spec.ec) });
    offset += spec.b1_dc;
  }
  for (let i = 0; i < spec.b2; i++) {
    const slice = dataCodewords.slice(offset, offset + spec.b2_dc);
    blocks.push({ data: slice, ec: rsEncode(slice, spec.ec) });
    offset += spec.b2_dc;
  }

  // Interleave data codewords across blocks
  const finalCodewords = [];
  const maxDc = Math.max(spec.b1_dc, spec.b2_dc || 0);
  for (let c = 0; c < maxDc; c++) {
    for (let b = 0; b < totalBlocks; b++) {
      if (c < blocks[b].data.length) finalCodewords.push(blocks[b].data[c]);
    }
  }

  // Interleave error correction codewords across blocks
  for (let c = 0; c < spec.ec; c++) {
    for (let b = 0; b < totalBlocks; b++) {
      finalCodewords.push(blocks[b].ec[c]);
    }
  }

  // Build final interleaved bitstream
  const finalBits = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) finalBits.push((cw >> i) & 1);
  }
  for (let i = 0; i < entry.rem; i++) finalBits.push(0);

  // 2. Matrix placement
  const size = entry.size;
  const matrix = Array.from({ length: size }, () =>
    new Int8Array(size).fill(-1),
  );
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

  // Finder patterns + 1-module separators
  /** @param {number} r @param {number} c */
  function placeFinder(r, c) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const row = r + dr;
        const col = c + dc;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          isFunc[row][col] = 1;
          if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
            matrix[row][col] =
              dr === 0 ||
              dr === 6 ||
              dc === 0 ||
              dc === 6 ||
              (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
                ? 1
                : 0;
          } else {
            matrix[row][col] = 0;
          }
        }
      }
    }
  }
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunc[6][i]) {
      isFunc[6][i] = 1;
      matrix[6][i] = i % 2 === 0 ? 1 : 0;
    }
    if (!isFunc[i][6]) {
      isFunc[i][6] = 1;
      matrix[i][6] = i % 2 === 0 ? 1 : 0;
    }
  }

  // Alignment patterns
  for (const r of entry.align) {
    for (const c of entry.align) {
      if (
        (r <= 8 && c <= 8) ||
        (r <= 8 && c >= size - 9) ||
        (r >= size - 9 && c <= 8)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const row = r + dr;
          const col = c + dc;
          isFunc[row][col] = 1;
          matrix[row][col] =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)
              ? 1
              : 0;
        }
      }
    }
  }

  // Dark module
  const darkRow = 4 * version + 9;
  const darkCol = 8;
  isFunc[darkRow][darkCol] = 1;
  matrix[darkRow][darkCol] = 1;

  // Reserve format information areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFunc[8][i] = 1;
      isFunc[i][8] = 1;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunc[8][size - 1 - i] = 1;
    if (i < 7) isFunc[size - 1 - i][8] = 1;
  }

  // Reserve version information areas if version >= 7
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        isFunc[size - 11 + j][i] = 1;
        isFunc[i][size - 11 + j] = 1;
      }
    }
  }

  // Place data bits in 2-column zigzag
  let bitIdx = 0;
  let dir = -1;
  let r = size - 1;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    while (true) {
      for (const col of [c, c - 1]) {
        if (!isFunc[r][col]) {
          matrix[r][col] = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
        }
      }
      const nextR = r + dir;
      if (nextR < 0 || nextR >= size) {
        dir = -dir;
        break;
      }
      r = nextR;
    }
  }

  // 3. Mask evaluation and selection
  const maskFns = [
    (/** @type {number} */ r, /** @type {number} */ c) => (r + c) % 2 === 0,
    (/** @type {number} */ r, /** @type {number} */ _c) => r % 2 === 0,
    (/** @type {number} */ _r, /** @type {number} */ c) => c % 3 === 0,
    (/** @type {number} */ r, /** @type {number} */ c) => (r + c) % 3 === 0,
    (/** @type {number} */ r, /** @type {number} */ c) =>
      (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (/** @type {number} */ r, /** @type {number} */ c) =>
      ((r * c) % 2) + ((r * c) % 3) === 0,
    (/** @type {number} */ r, /** @type {number} */ c) =>
      (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (/** @type {number} */ r, /** @type {number} */ c) =>
      (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  let bestMask = 0;
  let minPenalty = Infinity;
  const ecCode =
    ecLevel === "L" ? 1 : ecLevel === "M" ? 0 : ecLevel === "Q" ? 3 : 2;

  for (let mask = 0; mask < 8; mask++) {
    const fn = maskFns[mask];
    const testMatrix = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => {
        if (isFunc[row][col]) return matrix[row][col];
        return matrix[row][col] ^ (fn(row, col) ? 1 : 0);
      }),
    );

    // Apply format bits to testMatrix
    const fmt = getFormatBits(ecCode, mask);
    for (let i = 0; i < 15; i++) {
      const bit = (fmt >> i) & 1;
      if (i < 6) testMatrix[8][i] = bit;
      else if (i === 6) testMatrix[8][7] = bit;
      else if (i === 7) testMatrix[8][8] = bit;
      else if (i === 8) testMatrix[7][8] = bit;
      else testMatrix[14 - i][8] = bit;

      if (i < 8) testMatrix[8][size - 1 - i] = bit;
      else testMatrix[size - 1 - (14 - i)][8] = bit;
    }

    // Penalty scoring
    let penalty = 0;
    // N1: runs of 5 or more same color
    for (let row = 0; row < size; row++) {
      let runColor = -1;
      let runLen = 0;
      for (let col = 0; col < size; col++) {
        const val = testMatrix[row][col];
        if (val === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = val;
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }
    for (let col = 0; col < size; col++) {
      let runColor = -1;
      let runLen = 0;
      for (let row = 0; row < size; row++) {
        const val = testMatrix[row][col];
        if (val === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = val;
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }

    // N2: 2x2 blocks of same color
    for (let row = 0; row < size - 1; row++) {
      for (let col = 0; col < size - 1; col++) {
        const val = testMatrix[row][col];
        if (
          val === testMatrix[row + 1][col] &&
          val === testMatrix[row][col + 1] &&
          val === testMatrix[row + 1][col + 1]
        ) {
          penalty += 3;
        }
      }
    }

    // N4: balance of dark modules
    let darkCount = 0;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (testMatrix[row][col] === 1) darkCount++;
      }
    }
    const percent = (darkCount * 100) / (size * size);
    const steps = Math.floor(Math.abs(percent - 50) / 5);
    penalty += steps * 10;

    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = mask;
    }
  }

  // 4. Apply chosen mask to matrix
  const fn = maskFns[bestMask];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!isFunc[row][col]) {
        matrix[row][col] ^= fn(row, col) ? 1 : 0;
      }
    }
  }

  // Write format info
  const fmt = getFormatBits(ecCode, bestMask);
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> i) & 1;
    if (i < 6) matrix[i][8] = bit;
    else if (i === 6) matrix[7][8] = bit;
    else if (i === 7) matrix[8][8] = bit;
    else if (i === 8) matrix[8][7] = bit;
    else matrix[8][14 - i] = bit;

    if (i < 8) matrix[8][size - 1 - i] = bit;
    else matrix[size - 1 - (14 - i)][8] = bit;
  }

  // Write version info if version >= 7
  if (version >= 7) {
    const vbits = getVersionBits(version);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        const bit = (vbits >> (i * 3 + j)) & 1;
        matrix[size - 11 + j][i] = bit;
        matrix[i][size - 11 + j] = bit;
      }
    }
  }

  return matrix.map((row) => Array.from(row, (val) => val === 1));
}

/**
 * Generates an SVG string representation of the QR code.
 * @param {string} text
 * @param {{
 *   size?: number,
 *   margin?: number,
 *   color?: string,
 *   background?: string,
 *   ecLevel?: "L" | "M" | "Q" | "H"
 * }} [options]
 * @returns {string}
 */
function toSvg(text, options = {}) {
  const {
    size = 256,
    margin = 4,
    color = "currentColor",
    background = "transparent",
    ecLevel = "M",
  } = options;

  const matrix = createQrMatrix(text, { ecLevel });
  const count = matrix.length;
  const viewBoxSize = count + margin * 2;

  let path = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        let width = 1;
        while (c + width < count && matrix[r][c + width]) {
          width++;
        }
        path += `M${c + margin},${r + margin}h${width}v1h-${width}z `;
        c += width - 1;
      }
    }
  }

  const bgRect =
    background && background !== "transparent"
      ? `<rect width="${viewBoxSize}" height="${viewBoxSize}" fill="${background}"/>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" shape-rendering="crispEdges">${bgRect}<path d="${path.trim()}" fill="${color}"/></svg>`;
}

/**
 * Generates a Data URI (Base64) representing the QR code SVG.
 * @param {string} text
 * @param {Parameters<typeof toSvg>[1]} [options]
 * @returns {string}
 */
function toDataUri(text, options = {}) {
  const svg = toSvg(text, options);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

module.exports = {
  createQrMatrix,
  toSvg,
  toDataUri,
  QR_TABLE,
};
