"""Server-side CV PDF rendering (RenderCV + Typst).

Turns a stored CV document - a master CV or an application's CV copy - into a
PDF on the server, always with the single fixed ``applika`` theme
(docs/applika/adr/0011-server-side-cv-pdf-rendercv.md). Nothing here reads or
writes the database and nothing here is persisted: a render is a pure function
of the row it was handed.
"""
