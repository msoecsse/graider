import { imageSize } from "image-size";
import mammoth from "mammoth/mammoth.browser";
import {
  DOCX_CONVERSION_OPTIONS,
  DOCUMENT_LIMITS,
  DOCUMENT_TOO_LARGE
} from "../../electron/repositoryDocumentPolicy";

const isAnimatedPng = (bytes: Uint8Array): boolean => {
  const PNG_SIGNATURE_BYTES = 8;
  const CHUNK_HEADER_BYTES = 8;
  const CHUNK_CRC_BYTES = 4;
  const ANIMATION_CONTROL = "acTL";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let animated = false;
  for (
    let offset = PNG_SIGNATURE_BYTES;
    offset + CHUNK_HEADER_BYTES <= bytes.length && !animated;
  ) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(
      bytes.subarray(offset + CHUNK_CRC_BYTES, offset + CHUNK_HEADER_BYTES)
    );
    animated = type === ANIMATION_CONTROL;
    offset += CHUNK_HEADER_BYTES + length + CHUNK_CRC_BYTES;
  }
  return animated;
};

export const convertDocx = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  let imageBytes = 0;
  let imagePixels = 0;
  let resourceLimitExceeded = false;
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      ...DOCX_CONVERSION_OPTIONS,
      convertImage: mammoth.images.imgElement(async (image) => {
        const supported = new Set(["image/png", "image/jpeg"]);
        if (!supported.has(image.contentType)) return { src: "" };
        const bytes = await image.readAsArrayBuffer();
        imageBytes += bytes.byteLength;
        if (imageBytes > DOCUMENT_LIMITS.imageBytes) {
          resourceLimitExceeded = true;
          throw new Error(DOCUMENT_TOO_LARGE);
        }
        const raster = new Uint8Array(bytes);
        const dimensions = imageSize(raster);
        if (dimensions.type === "png" && isAnimatedPng(raster)) return { src: "" };
        if (
          (image.contentType === "image/png" && dimensions.type !== "png") ||
          (image.contentType === "image/jpeg" && dimensions.type !== "jpg")
        )
          return { src: "" };
        imagePixels += dimensions.width * dimensions.height;
        if (imagePixels > DOCUMENT_LIMITS.imagePixels) {
          resourceLimitExceeded = true;
          throw new Error(DOCUMENT_TOO_LARGE);
        }
        return { src: `data:${image.contentType};base64,${await image.readAsBase64String()}` };
      })
    }
  );
  // Mammoth converts image converter failures into warnings; enforce resource
  // failures explicitly rather than silently dropping an over-limit image.
  if (resourceLimitExceeded || result.value.length > DOCUMENT_LIMITS.docxHtmlCharacters)
    throw new Error(DOCUMENT_TOO_LARGE);
  return result.value;
};
