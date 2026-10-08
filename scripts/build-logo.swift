// Builds every logo and icon from one source picture. macOS only (CoreGraphics), no other tools needed.
//
//   swiftc -module-cache-path "$TMPDIR/swiftcache" scripts/build-logo.swift -o "$TMPDIR/build-logo"
//   "$TMPDIR/build-logo" docs/brand/mascot-source.jpg shared/pwa assets/apple-touch-icon.png
//
// The source is a sticker: a white background, a thin grey die-cut line, a white band, then the drawing. The
// white is removed by flooding inward from the picture's edge across every light pixel, so the character keeps
// its own dark outline and anything enclosed by it (skin, hat highlights) is left alone.
//
// Writes into the public folder: logo.png (transparent, used in the app header), favicon-32.png (transparent),
// icon-192.png and icon-512.png (cream background), icon-maskable-512.png (extra padding so Android's circular
// mask never crops the hat or boots), and the apple-touch-icon (cream, opaque: iOS paints transparency black).

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let arguments = CommandLine.arguments
guard arguments.count == 4 else {
  FileHandle.standardError.write(Data("usage: build-logo <source.jpg> <public-folder> <apple-touch-icon.png>\n".utf8))
  exit(2)
}
let sourcePath = arguments[1]
let publicFolder = arguments[2]
let applePath = arguments[3]

/// The app's cream (--color-cream in shared/ui/styles.css) behind the square icons.
let cream: (UInt8, UInt8, UInt8) = (248, 245, 239)
/// Pixels at least this light (every channel) count as sticker. The grey die-cut line is about 221.
let lightThreshold = 205

func loadImage(_ path: String) -> CGImage {
  guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else { fatalError("cannot read \(path)") }
  return image
}

func writePNG(_ image: CGImage, to path: String) {
  guard let destination = CGImageDestinationCreateWithURL(
    URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)
  else { fatalError("cannot write \(path)") }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else { fatalError("cannot finish \(path)") }
}

func makeContext(width: Int, height: Int) -> CGContext {
  CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

// 1. Cut the sticker out. Work on straight RGBA bytes (alpha starts opaque everywhere).
let original = loadImage(sourcePath)
let width = original.width
let height = original.height
let raw = makeContext(width: width, height: height)
raw.draw(original, in: CGRect(x: 0, y: 0, width: width, height: height))
let bytes = raw.data!.bindMemory(to: UInt8.self, capacity: width * height * 4)

func lightest(_ index: Int) -> Int { Int(min(bytes[index * 4], bytes[index * 4 + 1], bytes[index * 4 + 2])) }

var outside = [Bool](repeating: false, count: width * height)
var queue: [Int] = []
func visit(_ x: Int, _ y: Int) {
  guard x >= 0, y >= 0, x < width, y < height else { return }
  let index = y * width + x
  if !outside[index] && lightest(index) >= lightThreshold {
    outside[index] = true
    queue.append(index)
  }
}
for x in 0..<width { visit(x, 0); visit(x, height - 1) }
for y in 0..<height { visit(0, y); visit(width - 1, y) }
var head = 0
while head < queue.count {
  let index = queue[head]
  head += 1
  let x = index % width, y = index / width
  visit(x + 1, y); visit(x - 1, y); visit(x, y + 1); visit(x, y - 1)
}

// Soften the edge: a kept pixel touching the removed area fades by how light it is, so no white fringe survives.
var minX = width, minY = height, maxX = 0, maxY = 0
for y in 0..<height {
  for x in 0..<width {
    let index = y * width + x
    var alpha = 255
    if outside[index] {
      alpha = 0
    } else {
      var touchesOutside = false
      for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)] {
        let nx = x + dx, ny = y + dy
        if nx >= 0, ny >= 0, nx < width, ny < height, outside[ny * width + nx] { touchesOutside = true; break }
      }
      if touchesOutside {
        let light = lightest(index)
        if light > 150 { alpha = max(0, min(255, (lightThreshold - light) * 255 / (lightThreshold - 150) + 0)) }
      }
    }
    if alpha > 8 {
      minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
    }
    // CoreGraphics stored premultiplied alpha; scale the colour down with the new alpha.
    let base = index * 4
    bytes[base] = UInt8(Int(bytes[base]) * alpha / 255)
    bytes[base + 1] = UInt8(Int(bytes[base + 1]) * alpha / 255)
    bytes[base + 2] = UInt8(Int(bytes[base + 2]) * alpha / 255)
    bytes[base + 3] = UInt8(alpha)
  }
}

// 2. Crop to the character with a small margin.
let margin = 6
let crop = CGRect(
  x: max(0, minX - margin), y: max(0, minY - margin),
  width: min(width, maxX + margin) - max(0, minX - margin),
  height: min(height, maxY + margin) - max(0, minY - margin))
let cutout = raw.makeImage()!.cropping(to: crop)!

/// Draws the cut-out centred on a `side`-square canvas, `fill` of the side tall, on cream or transparent.
func square(side: Int, fill: Double, background: (UInt8, UInt8, UInt8)?) -> CGImage {
  let context = makeContext(width: side, height: side)
  context.interpolationQuality = .high
  if let background {
    context.setFillColor(
      CGColor(
        red: CGFloat(background.0) / 255, green: CGFloat(background.1) / 255, blue: CGFloat(background.2) / 255,
        alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: side, height: side))
  }
  let drawHeight = Double(side) * fill
  let drawWidth = drawHeight * Double(cutout.width) / Double(cutout.height)
  context.draw(
    cutout,
    in: CGRect(
      x: (Double(side) - drawWidth) / 2, y: (Double(side) - drawHeight) / 2, width: drawWidth, height: drawHeight))
  return context.makeImage()!
}

// 3. The header logo: transparent, about 4x the height it is drawn at (56px at most), so it stays sharp on phones.
let logoHeight = 240
let logoWidth = Int((Double(logoHeight) * Double(cutout.width) / Double(cutout.height)).rounded())
let logoContext = makeContext(width: logoWidth, height: logoHeight)
logoContext.interpolationQuality = .high
logoContext.draw(cutout, in: CGRect(x: 0, y: 0, width: logoWidth, height: logoHeight))
writePNG(logoContext.makeImage()!, to: "\(publicFolder)/logo.png")

// 4. Icons. «Maskable» icons are cropped to a circle of 80% of the side, so the character must fit inside it.
writePNG(square(side: 32, fill: 0.96, background: nil), to: "\(publicFolder)/favicon-32.png")
writePNG(square(side: 192, fill: 0.84, background: cream), to: "\(publicFolder)/icon-192.png")
writePNG(square(side: 512, fill: 0.84, background: cream), to: "\(publicFolder)/icon-512.png")
writePNG(square(side: 512, fill: 0.62, background: cream), to: "\(publicFolder)/icon-maskable-512.png")
writePNG(square(side: 180, fill: 0.84, background: cream), to: applePath)
print("logo \(logoWidth)x\(logoHeight), cut-out \(cutout.width)x\(cutout.height)")
