import json

from fastapi import APIRouter

from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    CurrentUserDp,
    TailoredDocumentRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.tailored_documents import (
    AtsReportSchema,
    TailoredDocumentSchema,
)
from app.core.exceptions import ResourceNotFound

router = APIRouter(
    prefix='/tailored-documents',
    tags=['Tailored Documents'],
    responses={'403': {'model': DetailSchema}},
)


@router.get(
    '/{document_id}',
    response_model=TailoredDocumentSchema,
    responses={'404': {'model': DetailSchema}},
)
async def get_document(
    document_id: SnowflakeID,
    current_user: CurrentUserDp,
    tailored_doc_repo: TailoredDocumentRepositoryDp,
):
    doc = await tailored_doc_repo.get_by_id_and_user(
        int(document_id), current_user.id
    )
    if doc is None:
        raise ResourceNotFound('Document not found')

    ats = None
    if doc.ats_report is not None:
        ats = AtsReportSchema(
            score=doc.ats_report.score,
            warnings=json.loads(doc.ats_report.warnings_json),
            missing_keywords=json.loads(
                doc.ats_report.missing_keywords_json
            ),
        )

    return TailoredDocumentSchema(
        id=doc.id,
        job_id=doc.job_id,
        kind=doc.kind,
        provider=doc.provider,
        content_json=doc.content_json,
        plain_text=doc.plain_text,
        created_at=doc.created_at,
        ats_report=ats,
    )


@router.get(
    '/{document_id}/ats',
    response_model=AtsReportSchema,
    responses={'404': {'model': DetailSchema}},
)
async def get_ats_report(
    document_id: SnowflakeID,
    current_user: CurrentUserDp,
    tailored_doc_repo: TailoredDocumentRepositoryDp,
):
    doc = await tailored_doc_repo.get_by_id_and_user(
        int(document_id), current_user.id
    )
    if doc is None:
        raise ResourceNotFound('Document not found')

    if doc.ats_report is None:
        raise ResourceNotFound('ATS report not found')

    return AtsReportSchema(
        score=doc.ats_report.score,
        warnings=json.loads(doc.ats_report.warnings_json),
        missing_keywords=json.loads(doc.ats_report.missing_keywords_json),
    )
