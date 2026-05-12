from applika.lib.api import ApiClient
from applika.schemas.application import ApplicationCompany
from applika.schemas.supports import Company, SupportSchema


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
