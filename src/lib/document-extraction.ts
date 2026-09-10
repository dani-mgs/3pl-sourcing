import Anthropic from "@anthropic-ai/sdk";

// pdfjs-dist (which pdf-parse wraps) always parses on a "worker". In Node it
// disables real worker threads and instead needs a `globalThis.pdfjsWorker`
// global — normally populated by dynamically import()-ing its own worker
// module, which is what "Setting up fake worker failed: Cannot find module
// '.../pdf.worker.mjs'" is: that dynamic import gets mangled by Turbopack's
// server bundle (pointing `workerSrc` at the real on-disk file doesn't help —
// Turbopack rewrites that import too once it recognizes the path). Statically
// importing the worker module ourselves sets the same global as a side effect,
// so pdfjs-dist finds it already populated and never attempts that import at all.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  if (name.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(
    "Unsupported file type. Please upload a .txt, .pdf, or .docx file.",
  );
}

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

export type ExtractionTool = Anthropic.Tool;

export type ExtractionToolResult<T> = { input: T } | { error: string };

// Runs a single forced tool-use call against the extraction model and returns
// the tool's raw structured input — callers map that into their own domain
// type and apply their own field-omission rules.
export async function runExtractionTool<T>(
  text: string,
  tool: ExtractionTool,
  systemPrompt: string,
): Promise<ExtractionToolResult<T>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("runExtractionTool: ANTHROPIC_API_KEY is not configured");
    return { error: "Document extraction isn't configured right now." };
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: text.slice(0, 50_000) }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    });

    const toolUse = response.content.find(
      (block) => block.type === "tool_use",
    );
    if (!toolUse || toolUse.type !== "tool_use") {
      return {
        error: "Couldn't extract any usable details from that document.",
      };
    }

    return { input: toolUse.input as T };
  } catch (err) {
    console.error("runExtractionTool: Anthropic API call failed", err);
    return {
      error: "Document extraction failed. You can still fill in the form manually.",
    };
  }
}
