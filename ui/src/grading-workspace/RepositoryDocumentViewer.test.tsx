import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RepositoryDocumentViewer } from "./RepositoryDocumentViewer";
vi.mock("./PdfDocumentViewer", () => ({
  PdfDocumentViewer: () => (
    <>
      <p>PDF text</p>
      <div className="repository-document__find">
        <label>
          Find PDF
          <input />
        </label>
      </div>
    </>
  )
}));
vi.mock("./DocxDocumentViewer", () => ({
  DocxDocumentViewer: () => (
    <>
      <p>DOCX text</p>
      <textarea aria-label="Unrelated editing" />
      <div className="repository-document__find">
        <label>
          Find DOCX
          <input />
        </label>
      </div>
    </>
  )
}));
const request = {
  courseFolderId: "course",
  courseFolderPath: "/course",
  termCode: "27s1",
  assignmentSlug: "lab",
  studentId: "ada",
  file: "report.pdf"
};
describe("individual document Find routing", () => {
  it.each([{ metaKey: true }, { ctrlKey: true }])(
    "focuses only the active PDF/DOCX search and preserves unrelated text entry (%j)",
    async (modifiers) => {
      Object.assign(window.graiderUI, {
        loadGradingStudentDocument: vi
          .fn()
          .mockResolvedValue({ status: "success", bytes: new Uint8Array([1]) })
      });
      const { rerender } = render(<RepositoryDocumentViewer request={request} />);
      const pdf = await screen.findByRole("textbox", { name: "Find PDF" });
      const root = screen.getByRole("region", { name: "Document report.pdf" });
      fireEvent.pointerDown(screen.getByText("PDF text"));
      expect(root).toHaveFocus();
      fireEvent.keyDown(root, { key: "f", ...modifiers });
      expect(pdf).toHaveFocus();
      rerender(
        <RepositoryDocumentViewer key="docx" request={{ ...request, file: "report.docx" }} />
      );
      const docx = await screen.findByRole("textbox", { name: "Find DOCX" });
      const editing = screen.getByRole("textbox", { name: "Unrelated editing" });
      editing.focus();
      fireEvent.keyDown(editing, { key: "f", ...modifiers });
      expect(editing).toHaveFocus();
      const docxRoot = screen.getByRole("region", { name: "Document report.docx" });
      fireEvent.keyDown(docxRoot, { key: "f", ...modifiers });
      expect(docx).toHaveFocus();
      expect(pdf).not.toBeInTheDocument();
    }
  );
});
