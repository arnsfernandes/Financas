// OCR local de PDF com o Vision da Apple (macOS). Sem rede, sem IA.
// Uso: vision-ocr arquivo.pdf  →  JSON: [[{s, x, y, w, h}, ...] por página]
// Coordenadas normalizadas (0–1), origem embaixo à esquerda, como o Vision devolve.
import AppKit
import Foundation
import PDFKit
import Vision

let args = CommandLine.arguments
guard args.count > 1, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("Não foi possível abrir o PDF\n".data(using: .utf8)!)
  exit(2)
}
// PDF protegido: a senha vem por variável de ambiente (não aparece na lista de processos).
if doc.isLocked {
  let password = ProcessInfo.processInfo.environment["VISION_OCR_PASSWORD"] ?? ""
  if password.isEmpty || !doc.unlock(withPassword: password) {
    FileHandle.standardError.write("PDF protegido por senha\n".data(using: .utf8)!)
    exit(3)
  }
}

var pages: [[[String: Any]]] = []
for index in 0..<doc.pageCount {
  guard let page = doc.page(at: index) else { continue }
  let bounds = page.bounds(for: .mediaBox)
  let scale: CGFloat = 3 // ~216 dpi: boa leitura de números pequenos
  let width = Int(bounds.width * scale)
  let height = Int(bounds.height * scale)
  guard let ctx = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else { continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
  ctx.scaleBy(x: scale, y: scale)
  ctx.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
  page.draw(with: .mediaBox, to: ctx)
  guard let image = ctx.makeImage() else { continue }

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["pt-BR", "en-US"]
  request.usesLanguageCorrection = false // não "corrigir" números e códigos
  try? VNImageRequestHandler(cgImage: image, options: [:]).perform([request])

  var items: [[String: Any]] = []
  for observation in request.results ?? [] {
    guard let candidate = observation.topCandidates(1).first else { continue }
    let box = observation.boundingBox
    items.append(["s": candidate.string, "x": box.minX, "y": box.midY, "w": box.width, "h": box.height])
  }
  pages.append(items)
}

FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: pages))
