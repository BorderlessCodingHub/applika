// Minimal Typst template for a CV diff export (KODI-017, T091).
//
// The diff PDF carries "the same content as the Markdown" (T091, "Diff PDF")
// - not a typeset replica of the CV itself - so this template does exactly
// one thing: it prints the already-built diff Markdown document verbatim, as
// a preformatted block, via `sys.inputs` (compiled with
// `sys_inputs={"content": <markdown text>}`, see `diff_pdf_renderer.py`).
// `sys.inputs` is used instead of interpolating the text into this source so
// no CV content - which is free text and may contain `#`, `[`, `*` or other
// Typst markup syntax - ever needs escaping.
#set page(paper: "a4", margin: 1in)
#set text(font: "Source Sans 3", size: 10pt)
#show raw: set text(font: "Source Sans 3")
#raw(sys.inputs.at("content"), block: true)
