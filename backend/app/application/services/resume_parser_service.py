"""Resume parser — supports PDF, DOCX, and plain text.

pypdf and python-docx are imported lazily so the app runs even if they
are not installed (graceful degradation).
"""
from __future__ import annotations

import io
from dataclasses import dataclass

SUPPORTED_CONTENT_TYPES = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument'
    '.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'text/markdown': 'txt',
}


class UnsupportedResumeFormat(ValueError):
    ...


@dataclass
class ParsedResume:
    text: str
    byte_size: int
    content_type: str


def _parse_pdf(data: bytes) -> str:
    try:
        import pypdf  # noqa: PLC0415
    except ImportError as exc:
        raise UnsupportedResumeFormat(
            'pypdf is not installed; cannot parse PDF files.'
        ) from exc
    reader = pypdf.PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ''
        parts.append(text)
    return '\n'.join(parts)


def _parse_docx(data: bytes) -> str:
    try:
        import docx  # noqa: PLC0415
    except ImportError as exc:
        raise UnsupportedResumeFormat(
            'python-docx is not installed; cannot parse DOCX files.'
        ) from exc
    doc = docx.Document(io.BytesIO(data))
    return '\n'.join(
        para.text for para in doc.paragraphs if para.text.strip()
    )


def _parse_txt(data: bytes) -> str:
    try:
        return data.decode('utf-8')
    except UnicodeDecodeError:
        return data.decode('latin-1', errors='replace')


def parse_resume(
    data: bytes, content_type: str, filename: str = ''
) -> ParsedResume:
    fmt = SUPPORTED_CONTENT_TYPES.get(content_type)
    if fmt is None:
        raise UnsupportedResumeFormat(
            f'Unsupported resume format: {content_type}. '
            f'Allowed: PDF, DOCX, TXT.'
        )
    if fmt == 'pdf':
        text = _parse_pdf(data)
    elif fmt == 'docx':
        text = _parse_docx(data)
    else:
        text = _parse_txt(data)
    return ParsedResume(
        text=text.strip(),
        byte_size=len(data),
        content_type=content_type,
    )
