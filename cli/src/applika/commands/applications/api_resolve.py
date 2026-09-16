from typing import Any

from applika.lib.api import ApiClient
from applika.schemas.application import ApplicationCompany
from applika.schemas.supports import (
    Company,
    FeedbackDefinitionSchema,
    StepDefinitionSchema,
    SupportSchema,
)


def resolve_platform_id(client: ApiClient, platform_name: str) -> str:
    """
    Resolve a platform name to its corresponding ID using
    the supports endpoint.
    """
    supports: SupportSchema = client.get_json('/supports')

    normalized_name = platform_name.strip().lower()
    match = next(
        (
            platform
            for platform in supports['platforms']
            if platform['name'].strip().lower() == normalized_name
        ),
        None,
    )
    if match is None:
        valid = ', '.join(
            sorted(platform['name'] for platform in supports['platforms'])
        )
        raise ValueError(f'Unknown platform. Valid options: {valid}')

    return str(match['id'])


def resolve_step_id(
    supports: SupportSchema,
    step_name_or_id: str,
    *,
    strict: bool,
) -> str:
    steps = [
        step for step in supports['steps'] if bool(step['strict']) is strict
    ]
    return _resolve_named_support_item(
        steps,
        step_name_or_id,
        label='step',
    )


def resolve_feedback_id(
    supports: SupportSchema,
    feedback_name_or_id: str,
) -> str:
    return _resolve_named_support_item(
        supports['feedbacks'],
        feedback_name_or_id,
        label='feedback',
    )


def resolve_company_input(
    client: ApiClient,
    company_name: str,
    company_url: str | None,
) -> str | ApplicationCompany:
    """
    Resolve a company name to its corresponding ID using the
    companies endpoint. If no exact match is found, return a dict with
    the provided name and URL for creation.
    """
    query = company_name.strip().lower()
    matches: list[Company] = client.get_json(
        '/companies', params={'name': query}
    )
    exact_match = next(
        (
            company
            for company in matches
            if company['name'].strip().lower() == query
        ),
        None,
    )
    if exact_match:
        return str(exact_match['id'])

    return {'name': company_name.strip(), 'url': company_url or None}


def _resolve_named_support_item(
    items: list[StepDefinitionSchema] | list[FeedbackDefinitionSchema],
    name_or_id: str,
    *,
    label: str,
) -> str:
    query = name_or_id.strip()
    normalized_query = query.lower()

    exact_id_match = next(
        (item for item in items if str(item['id']) == query),
        None,
    )
    if exact_id_match is not None:
        return str(exact_id_match['id'])

    exact_name_match = next(
        (
            item
            for item in items
            if item['name'].strip().lower() == normalized_query
        ),
        None,
    )
    if exact_name_match is not None:
        return str(exact_name_match['id'])

    valid = ', '.join(sorted(_support_item_name(item) for item in items))
    raise ValueError(f'Unknown {label}. Valid options: {valid}')


def _support_item_name(item: dict[str, Any]) -> str:
    return str(item['name'])
