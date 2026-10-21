import { convertDocx } from "./docxConversion";
import { DOCUMENT_TOO_LARGE } from "../../electron/repositoryDocumentPolicy";
self.onmessage = (event: MessageEvent<ArrayBuffer>): void => {
  void convertDocx(event.data)
    .then((html) => {
      self.postMessage({ html });
    })
    .catch((error: unknown) => {
      self.postMessage({
        error:
          error instanceof Error && error.message === DOCUMENT_TOO_LARGE
            ? DOCUMENT_TOO_LARGE
            : "This DOCX is damaged or contains unsupported content."
      });
    });
};
