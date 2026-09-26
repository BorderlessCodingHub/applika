"""
Mock data seeder for Applika.dev backend.

Creates 50+ job applications with a 3-5 event timeline each, simulating
a 3-month job search period (Jan 5 – Mar 30, 2026).

Half the applications go through the timeline API the web app uses
(``/applications/{id}/timeline``, finalize without a body, reopen); the
other half through the deprecated routes installed ``applika-cli`` 0.1.4
still calls (``/applications/{id}/steps`` and ``/finalize`` with the
step/feedback body), and every deprecated answer is checked for its
``Deprecation`` header.

Usage:
    1. Start the backend server (uv run task run)
    2. Log in via GitHub OAuth to get an access token
    3. Set ACCESS_TOKEN below with your JWT token
    4. Run: python scripts/seed_mock_data.py
"""

import random
from datetime import date, timedelta

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL = 'http://127.0.0.1:8000'
ACCESS_TOKEN = input('Put your access token here: ')

# Date range: Jan 5 – Mar 30, 2026
DATE_START = date(2026, 1, 5)
DATE_END = date(2026, 3, 30)
DATE_RANGE_DAYS = (DATE_END - DATE_START).days

# How many applications to create
NUM_APPLICATIONS = 55
# How many must end with an offer
MIN_ACCEPTED = 5

INTERVIEW_TYPES = [
    'unknown',
    'technical',
    'cultural',
    'hiring_manager',
    'take_home',
    'final',
]
# KODI-014: a denied event/finalize picks one of these at random, some of the
# time; the rest stay unset and default to `unknown` server-side.
DENIED_REASONS = [
    'not_good_enough',
    'skills_mismatch',
    'assessment_failed',
    'too_many_candidates',
    'position_filled',
    'role_closed',
    'ghosted',
    'salary_mismatch',
    'other',
]
# applika's 9 and mynextjob's 11 (R-031); None = no currency.
CURRENCIES = ['USD', 'BRL', 'EUR', 'GBP', 'SEK', 'CNY', 'AED', None]

# ---------------------------------------------------------------------------
# Realistic mock data pools
# ---------------------------------------------------------------------------
COMPANIES = [
    ('Google', 'https://www.linkedin.com/company/google'),
    ('Microsoft', 'https://www.linkedin.com/company/microsoft'),
    ('Amazon', 'https://www.linkedin.com/company/amazon'),
    ('Meta', 'https://www.linkedin.com/company/meta'),
    ('Apple', 'https://www.linkedin.com/company/apple'),
    ('Netflix', 'https://www.linkedin.com/company/netflix'),
    ('Spotify', 'https://www.linkedin.com/company/spotify'),
    ('Stripe', 'https://www.linkedin.com/company/stripe'),
    ('Shopify', 'https://www.linkedin.com/company/shopify'),
    ('Airbnb', 'https://www.linkedin.com/company/airbnb'),
    ('Uber', 'https://www.linkedin.com/company/uber'),
    ('Lyft', 'https://www.linkedin.com/company/lyft'),
    ('Slack', 'https://www.linkedin.com/company/slack'),
    ('Datadog', 'https://www.linkedin.com/company/datadog'),
    ('Cloudflare', 'https://www.linkedin.com/company/cloudflare'),
    ('Vercel', 'https://www.linkedin.com/company/vercel'),
    ('Supabase', 'https://www.linkedin.com/company/supabase'),
    ('Twilio', 'https://www.linkedin.com/company/twilio'),
    ('Square', 'https://www.linkedin.com/company/square'),
    ('Palantir', 'https://www.linkedin.com/company/palantir'),
    ('Coinbase', 'https://www.linkedin.com/company/coinbase'),
    ('Figma', 'https://www.linkedin.com/company/figma'),
    ('Notion', 'https://www.linkedin.com/company/notion'),
    ('Linear', 'https://www.linkedin.com/company/linear'),
    ('Deel', 'https://www.linkedin.com/company/deel'),
    ('Remote', 'https://www.linkedin.com/company/remote'),
    ('GitLab', 'https://www.linkedin.com/company/gitlab'),
    ('HashiCorp', 'https://www.linkedin.com/company/hashicorp'),
    ('Elastic', 'https://www.linkedin.com/company/elastic'),
    ('MongoDB', 'https://www.linkedin.com/company/mongodb'),
    ('Snowflake', 'https://www.linkedin.com/company/snowflake'),
    ('Databricks', 'https://www.linkedin.com/company/databricks'),
    ('Confluent', 'https://www.linkedin.com/company/confluent'),
    ('PagerDuty', 'https://www.linkedin.com/company/pagerduty'),
    ('Sentry', 'https://www.linkedin.com/company/sentry'),
    ('LaunchDarkly', 'https://www.linkedin.com/company/launchdarkly'),
    ('Postman', 'https://www.linkedin.com/company/postman'),
    ('JetBrains', 'https://www.linkedin.com/company/jetbrains'),
    ('Atlassian', 'https://www.linkedin.com/company/atlassian'),
    ('Canva', 'https://www.linkedin.com/company/canva'),
    ('Wise', 'https://www.linkedin.com/company/wise'),
    ('Revolut', 'https://www.linkedin.com/company/revolut'),
    ('N26', 'https://www.linkedin.com/company/n26'),
    ('Nubank', 'https://www.linkedin.com/company/nubank'),
    ('iFood', 'https://www.linkedin.com/company/ifood'),
    ('Mercado Libre', 'https://www.linkedin.com/company/mercadolibre'),
    ('VTEX', 'https://www.linkedin.com/company/vtex'),
    ('Wildlife Studios', 'https://www.linkedin.com/company/wildlife-studios'),
    ('PicPay', 'https://www.linkedin.com/company/picpay'),
    ('Stone', 'https://www.linkedin.com/company/stone-pagamentos'),
    ('Globo', 'https://www.linkedin.com/company/globo'),
    ('CI&T', 'https://www.linkedin.com/company/ciandt'),
    ('ThoughtWorks', 'https://www.linkedin.com/company/thoughtworks'),
    ('Zup Innovation', 'https://www.linkedin.com/company/zup-innovation'),
    ('Loft', 'https://www.linkedin.com/company/loft'),
]

ROLES = [
    'Backend Engineer',
    'Frontend Engineer',
    'Full Stack Developer',
    'Senior Software Engineer',
    'Staff Engineer',
    'DevOps Engineer',
    'Platform Engineer',
    'Data Engineer',
    'ML Engineer',
    'SRE',
    'Engineering Manager',
    'Tech Lead',
    'Software Architect',
    'Python Developer',
    'Go Developer',
    'Cloud Engineer',
]

COUNTRIES = [
    'United States',
    'Brazil',
    'Germany',
    'United Kingdom',
    'Canada',
    'Netherlands',
    'Portugal',
    'Remote',
]

OBSERVATIONS = [
    'Found on LinkedIn job board',
    'Referral from a friend',
    'Recruiter reached out',
    'Applied after meetup conversation',
    'Company has great engineering blog',
    'Interesting tech stack',
    'Good work-life balance reviews',
    'Competitive compensation',
    'Applied through company careers page',
    'Saw the posting on Hacker News',
    None,
    None,
    None,
]

STEP_OBSERVATIONS = [
    'Went well, positive feedback',
    'Technical questions about system design',
    'Discussed team culture and projects',
    'Live coding session — solved 2 problems',
    'Pair programming exercise',
    'Behavioral interview with hiring manager',
    'Presented past project architecture',
    'Quick screening call with recruiter',
    'Take-home assignment completed',
    'Panel interview with 3 engineers',
    None,
    None,
    None,
    None,
]


# ---------------------------------------------------------------------------
# Master CVs (max 3 per user)
# ---------------------------------------------------------------------------
# The owner's rule: "a user can create up to 3 master CV's". The seeder
# creates exactly three and then attempts a fourth on purpose, so a run also
# proves the 409 refusal is still wired up.
MAX_BASE_CVS = 3

BASE_CVS = [
    {
        'name': 'Backend CV',
        'full_name': 'Alex Moreira',
        'headline': 'Senior Backend Engineer',
        'location': 'Lisbon, Portugal',
        'email': 'alex.moreira@example.com',
        'phone': '+351 910 000 000',
        'summary': 'Ten years building Python services at scale.',
        'links': [
            {
                'id': 'lnk-gh',
                'label': 'GitHub',
                'url': 'https://github.com/alexmoreira',
            },
            {
                'id': 'lnk-li',
                'label': 'LinkedIn',
                'url': 'https://www.linkedin.com/in/alexmoreira',
            },
        ],
        'skills': [
            {
                'id': 'skl-lang',
                'category': 'Languages & Frameworks',
                'keywords': ['Python', 'FastAPI', 'TypeScript'],
            },
            {
                'id': 'skl-data',
                'category': 'Data & Messaging',
                'keywords': ['PostgreSQL', 'Redis'],
            },
            {
                'id': 'skl-plat',
                'category': 'Platform & Delivery',
                'keywords': ['Docker', 'GitHub Actions'],
            },
        ],
        'experience': [
            {
                'id': 'exp-1',
                'company': 'Acme Corp',
                'company_description': 'Payments platform, 300 engineers',
                'role': 'Senior Backend Engineer',
                # No 'end': this is the job Alex holds today, so the seeded
                # data exercises the 'present' path through the PDF as well
                # as the ordinary closed range below.
                'start': '2021-03',
                'location': 'Remote',
                'bullets': [
                    'Cut p99 latency from 1.2s to 180ms',
                    'Led the migration to async SQLAlchemy',
                ],
            }
        ],
        'projects': [
            {
                'id': 'prj-1',
                'name': 'applika',
                'description': 'Job application tracker with analytics',
                'link': 'https://applika.dev',
                'link_label': 'applika.dev',
            }
        ],
        'education': [
            {
                'id': 'edu-1',
                'institution': 'Universidade de Lisboa',
                'degree': "Bachelor's degree",
                'area': 'Computer Science',
                'start': '2012-09',
                'end': '2016-07',
            }
        ],
        'certifications': [
            {'id': 'crt-1', 'name': 'AWS Solutions Architect', 'issuer': 'AWS'}
        ],
        'languages': [
            {'id': 'lng-pt', 'name': 'Portuguese', 'level': 'Native'},
            {'id': 'lng-en', 'name': 'English', 'level': 'C2'},
        ],
    },
    {
        'name': 'Platform CV',
        'full_name': 'Alex Moreira',
        'headline': 'Platform / DevOps Engineer',
        'location': 'Lisbon, Portugal',
        'email': 'alex.moreira@example.com',
        'summary': 'Infrastructure as code, CI/CD and observability.',
        'skills': [
            {
                'id': 'skl-iac',
                'category': 'Infrastructure',
                'keywords': ['Terraform', 'Kubernetes'],
            },
            {
                'id': 'skl-obs',
                'category': 'Delivery & Observability',
                'keywords': ['GitHub Actions', 'Grafana'],
            },
        ],
        'experience': [
            {
                'id': 'exp-2',
                'company': 'Globex',
                'role': 'Platform Engineer',
                'start': '2019-01',
                'end': '2021-02',
                'bullets': ['Built the deployment pipeline from scratch'],
            }
        ],
        'languages': [{'id': 'lng-en', 'name': 'English', 'level': 'C2'}],
    },
    {
        'name': 'Leadership CV',
        'full_name': 'Alex Moreira',
        'headline': 'Engineering Manager',
        'location': 'Lisbon, Portugal',
        'email': 'alex.moreira@example.com',
        'summary': 'Grew and led two product teams.',
        'skills': [
            {
                'id': 'skl-lead',
                'category': 'Leadership',
                'keywords': ['Coaching', 'Hiring', 'Roadmapping'],
            }
        ],
        'languages': [{'id': 'lng-en', 'name': 'English', 'level': 'C2'}],
    },
]


def seed_base_cvs(client: httpx.Client) -> list[str]:
    """Create the 3 allowed master CVs, then prove the 4th is refused."""
    print(f'Creating {MAX_BASE_CVS} master CVs...')
    created_ids: list[str] = []

    for index, base_cv in enumerate(BASE_CVS[:MAX_BASE_CVS], start=1):
        resp = client.post('/base-cvs', json=base_cv)
        if resp.status_code != 201:
            print(
                f'  [{index}] Failed to create master CV: '
                f'{resp.status_code} {resp.text}'
            )
            continue
        created_ids.append(resp.json()['id'])
        print(f'  [{index}/{MAX_BASE_CVS}] {base_cv["name"]}')

    # The 4th must come back 409 with the limit message.
    overflow = dict(BASE_CVS[0], name='Fourth CV (must be refused)')
    resp = client.post('/base-cvs', json=overflow)
    if resp.status_code == 409:
        print(f'  4th master CV refused as expected: {resp.json()["detail"]}')
    else:
        print(
            f'  WARNING: the 4th master CV was NOT refused: '
            f'{resp.status_code} {resp.text}'
        )

    return created_ids


JOB_DESCRIPTIONS = [
    'We are looking for a backend engineer comfortable with Python, '
    'FastAPI and PostgreSQL. You will own services end to end, from the '
    'schema to the deploy.',
    'Senior full-stack role. React on the front, Go on the back, '
    'Kubernetes in between. Strong testing culture, trunk-based '
    'development, no on-call rotation.',
    'Platform team. You will spend your days on CI, observability and '
    'developer experience. Terraform and AWS are a must.',
    None,
]


def seed_application_cv(
    client: httpx.Client,
    app_id: str,
    base_cv_ids: list[str],
    full_cycle: bool = False,
) -> bool:
    """Give one application a CV copy, exercising the /cv endpoints.

    ``full_cycle`` runs every verb once - create, read, update, delete, then
    create again from a different master CV - so a single seed run proves all
    four routes still work. The other applications only get the create, which
    is what a realistic database looks like.

    Returns whether the application ends up holding a copy.
    """
    if not base_cv_ids:
        return False

    resp = client.post(
        f'/applications/{app_id}/cv',
        json={'base_cv_id': random.choice(base_cv_ids)},
    )
    if resp.status_code != 201:
        print(f'  Failed to create the CV copy: {resp.status_code} {resp.text}')
        return False
    if not full_cycle:
        return True

    copy = resp.json()
    print(f'  CV copy created from master CV {copy["base_cv_id"]}')

    # A second copy must be refused - one per application.
    resp = client.post(
        f'/applications/{app_id}/cv',
        json={'base_cv_id': random.choice(base_cv_ids)},
    )
    if resp.status_code == 409:
        print(f'  2nd CV copy refused as expected: {resp.json()["detail"]}')
    else:
        print(
            f'  WARNING: the 2nd CV copy was NOT refused: '
            f'{resp.status_code} {resp.text}'
        )

    # Edit it: a PUT carries every editable field.
    edited = {
        field: copy[field]
        for field in (
            'name',
            'full_name',
            'headline',
            'location',
            'email',
            'phone',
            'summary',
            'links',
            'skills',
            'experience',
            'projects',
            'education',
            'certifications',
            'languages',
        )
    }
    edited['summary'] = 'Tailored to this posting during the seed run.'
    resp = client.put(f'/applications/{app_id}/cv', json=edited)
    if resp.status_code != 200:
        print(f'  Failed to edit the CV copy: {resp.status_code} {resp.text}')
    else:
        print('  CV copy edited')

    resp = client.get(f'/applications/{app_id}/cv')
    if resp.status_code != 200:
        print(f'  Failed to read the CV copy: {resp.status_code} {resp.text}')

    # Delete it, then make a fresh one - deleting frees the application.
    resp = client.delete(f'/applications/{app_id}/cv')
    if resp.status_code != 204:
        print(f'  Failed to delete the CV copy: {resp.status_code} {resp.text}')
        return True
    print('  CV copy deleted')

    resp = client.post(
        f'/applications/{app_id}/cv',
        json={'base_cv_id': random.choice(base_cv_ids)},
    )
    if resp.status_code != 201:
        print(
            f'  Failed to recreate the CV copy: {resp.status_code} {resp.text}'
        )
        return False
    print('  CV copy recreated from another master CV')
    return True


def seed_cv_pdfs(
    client: httpx.Client,
    base_cv_id: str | None,
    application_id: str | None,
) -> None:
    """Exercise both PDF export routes and check what came back is a PDF.

    Run at the very end, after the applications have been finalized: the copy
    of a finalized application must still export, and this is the cheapest
    place to notice if that ever stops being true.
    """
    print('\nExporting CV PDFs...')
    targets = [
        ('master CV', f'/base-cvs/{base_cv_id}/pdf' if base_cv_id else None),
        (
            "application's CV copy",
            f'/applications/{application_id}/cv/pdf'
            if application_id
            else None,
        ),
    ]
    for label, url in targets:
        if url is None:
            print(f'  Skipped the {label}: nothing to export')
            continue
        resp = client.post(url)
        if resp.status_code != 200:
            print(
                f'  Failed to export the {label}: '
                f'{resp.status_code} {resp.text}'
            )
            continue
        content_type = resp.headers.get('content-type')
        disposition = resp.headers.get('content-disposition')
        if not resp.content.startswith(b'%PDF-'):
            print(f'  WARNING: the {label} export is not a PDF')
            continue
        print(
            f'  {label}: {len(resp.content)} bytes, {content_type}, '
            f'{disposition}'
        )


def check_deprecated(resp: httpx.Response, label: str) -> None:
    """Every answer of a deprecated route carries ``Deprecation``."""
    if 'deprecation' not in resp.headers:
        print(f'  WARNING: {label} answered without a Deprecation header')


def seed_timeline(
    client: httpx.Client,
    app_id: str,
    first_date: date,
    plan: dict | None,
) -> bool:
    """The web app's path: timeline events, then finalize.

    One initial screening (an application holds at most one), then a mix of
    typed interviews and notes, then the outcome. Half the finalized
    applications get their outcome through the new optional finalize body
    (R-032: the outcome event and the close in one atomic request); the
    other half keep adding the outcome as a plain `/timeline` event and
    then finalize without a body, exercising both paths. Returns True when
    the application ended closed.
    """
    url = f'/applications/{app_id}/timeline'
    day = first_date
    events: list[dict] = [
        {'event_type': 'interview', 'interview_type': 'initial_screening'}
    ]
    for _ in range(random.randint(2, 4)):
        if random.random() < 0.25:
            events.append({'event_type': 'note'})
        else:
            events.append({
                'event_type': 'interview',
                'interview_type': random.choice(INTERVIEW_TYPES),
            })
    for index, event in enumerate(events):
        body = {
            **event,
            'event_date': day.isoformat(),
            'observation': random.choice(STEP_OBSERVATIONS),
        }
        if index == 0 and random.random() < 0.5:
            body.update({
                'start_time': '10:00',
                'end_time': '10:45',
                'timezone': 'America/Sao_Paulo',
            })
        resp = client.post(url, json=body)
        if resp.status_code != 201:
            print(f'  Failed to add event: {resp.status_code} {resp.text}')
        day = min(day + timedelta(days=random.randint(3, 14)), DATE_END)

    if plan is None:
        return False

    if random.random() < 0.5:
        # R-032: the outcome event and the close in one atomic request, no
        # Deprecation header.
        if plan['offer']:
            body = {
                'outcome': 'offer',
                'salary_amount': str(random.choice([5000, 8000, 12000, 15000])),
                'salary_currency': random.choice(['USD', 'EUR', 'BRL', 'NZD']),
                # `annual` is the 0.1.4 spelling; it is stored as annually.
                'salary_period': random.choice([
                    'monthly',
                    'annually',
                    'annual',
                ]),
                'observation': 'Offer received',
            }
        else:
            body = {'outcome': 'denied', 'observation': 'Not selected'}
            if random.random() < 0.5:
                body['denied_reason'] = random.choice(DENIED_REASONS)
        resp = client.post(
            f'/applications/{app_id}/finalize',
            json={**body, 'event_date': day.isoformat()},
        )
        if resp.status_code != 200:
            print(
                f'  Failed to finalize with outcome: '
                f'{resp.status_code} {resp.text}'
            )
            return False
        if 'Deprecation' in resp.headers:
            print('  WARNING: new finalize body carries a Deprecation header')
        return True

    if plan['offer']:
        outcome = {
            'event_type': 'offer',
            'salary_amount': str(random.choice([5000, 8000, 12000, 15000])),
            'salary_currency': random.choice(['USD', 'EUR', 'BRL', 'NZD']),
            # `annual` is the 0.1.4 spelling; it is stored as annually.
            'salary_period': random.choice(['monthly', 'annually', 'annual']),
            'observation': 'Offer received',
        }
    else:
        outcome = {'event_type': 'denied', 'observation': 'Not selected'}
        if random.random() < 0.5:
            outcome['denied_reason'] = random.choice(DENIED_REASONS)
    resp = client.post(url, json={**outcome, 'event_date': day.isoformat()})
    if resp.status_code != 201:
        print(f'  Failed to add outcome: {resp.status_code} {resp.text}')

    resp = client.post(f'/applications/{app_id}/finalize')
    if resp.status_code != 200:
        print(f'  Failed to finalize: {resp.status_code} {resp.text}')
        return False
    if random.random() < 0.2:
        # Reversible close: a closed timeline refuses events (409) until
        # the application is reopened.
        refused = client.post(
            url, json={'event_type': 'note', 'event_date': day.isoformat()}
        )
        if refused.status_code != 409:
            print('  WARNING: closed application accepted an event')
        client.post(f'/applications/{app_id}/reopen')
        client.post(
            url,
            json={
                'event_type': 'feedback',
                'event_date': day.isoformat(),
                'observation': 'Recruiter sent written feedback',
            },
        )
        client.post(f'/applications/{app_id}/finalize')
    return True


def seed_legacy_steps(
    client: httpx.Client,
    app_id: str,
    first_date: date,
    plan: dict | None,
    normal_steps: list[dict],
    offer_step: dict,
    denied_step: dict,
) -> bool:
    """applika-cli 0.1.4's path: the deprecated /steps and the /finalize
    body. Returns True when the application ended closed."""
    day = first_date
    # One Initial Screen at most per application (R-030).
    screen = [s for s in normal_steps if s['name'] == 'Initial Screen']
    others = [s for s in normal_steps if s['name'] != 'Initial Screen']
    picks = screen[:1] + [
        random.choice(others or normal_steps)
        for _ in range(random.randint(2, 4))
    ]
    last_step: dict | None = None
    for step_def in picks:
        resp = client.post(
            f'/applications/{app_id}/steps',
            json={
                'step_id': step_def['id'],
                'step_date': day.isoformat(),
                'observation': random.choice(STEP_OBSERVATIONS),
            },
        )
        check_deprecated(resp, 'POST /steps')
        if resp.status_code != 201:
            print(f'  Failed to add step: {resp.status_code} {resp.text}')
        else:
            last_step = resp.json()
        day = min(day + timedelta(days=random.randint(3, 14)), DATE_END)

    listed = client.get(f'/applications/{app_id}/steps')
    check_deprecated(listed, 'GET /steps')
    if last_step is not None and random.random() < 0.3:
        # `steps edit` without --step resends the listed step_id.
        current = next(s for s in listed.json() if s['id'] == last_step['id'])
        resp = client.put(
            f'/applications/{app_id}/steps/{current["id"]}',
            json={
                'step_id': current['step_id'],
                'step_date': current['step_date'],
                'observation': 'Rescheduled',
            },
        )
        check_deprecated(resp, 'PUT /steps')

    if plan is None:
        return False

    step = offer_step if plan['offer'] else denied_step
    fin_payload = {
        'step_id': step['id'],
        'feedback_id': plan['feedback']['id'],
        'finalize_date': day.isoformat(),
        # A salary only on the Offer step: anything else is refused.
        'salary_offer': (
            random.choice([5000, 8000, 12000, 15000, 20000, 25000])
            if plan['offer']
            else None
        ),
        'observation': (
            'Offer accepted!'
            if plan['offer']
            else random.choice([
                'No response after final round',
                'Position filled internally',
                'Decided to go with another candidate',
                None,
            ])
        ),
    }
    resp = client.post(f'/applications/{app_id}/finalize', json=fin_payload)
    check_deprecated(resp, 'POST /finalize (body)')
    if resp.status_code != 201:
        print(f'  Failed to finalize: {resp.status_code} {resp.text}')
        return False
    return True


def random_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def build_headers() -> dict:
    return {
        'Cookie': f'__access={ACCESS_TOKEN}',
        'Content-Type': 'application/json',
    }


def main():
    headers = build_headers()

    with httpx.Client(base_url=BASE_URL, headers=headers, timeout=30) as client:
        # ----- Fetch support data (platforms, steps, feedbacks) -----
        print('Fetching support data...')
        resp = client.get('/supports')
        resp.raise_for_status()
        supports = resp.json()

        platforms = supports['platforms']
        step_defs = supports['steps']
        feedback_defs = supports['feedbacks']

        platform_ids = [p['id'] for p in platforms]

        # ----- Private catalog rows (KODI-031, ADR-0014) -----
        # A platform with no url, and a company: both start private to this
        # seed user, exercised end to end on one application below.
        print('Seeding a private platform and a private company...')
        priv_platform_resp = client.post(
            '/platforms',
            json={'name': 'Founder Referral Board', 'url': None},
        )
        priv_platform_resp.raise_for_status()
        private_platform_id = priv_platform_resp.json()['id']

        priv_company_resp = client.post(
            '/companies',
            json={
                'name': 'Stealth Startup Inc',
                'url': 'https://stealth-startup.example.com',
            },
        )
        priv_company_resp.raise_for_status()
        private_company_id = priv_company_resp.json()['id']

        # Separate strict vs non-strict steps
        normal_steps = [s for s in step_defs if not s.get('strict', False)]
        strict_steps = [s for s in step_defs if s.get('strict', False)]

        # Find "Accepted" and other feedbacks
        accepted_fb = next(
            (f for f in feedback_defs if f['name'].lower() == 'accepted'),
            None,
        )
        other_feedbacks = [
            f for f in feedback_defs if f['name'].lower() != 'accepted'
        ]

        offer_step = next(
            (s for s in strict_steps if s['name'] == 'Offer'), None
        )
        denied_step = next(
            (s for s in strict_steps if s['name'] == 'Denied'), None
        )

        if not normal_steps:
            print('ERROR: No non-strict step definitions found.')
            return
        if not offer_step or not denied_step:
            print('ERROR: No "Offer"/"Denied" strict step definitions found.')
            return
        if not accepted_fb:
            print('ERROR: No "Accepted" feedback definition found.')
            return

        print(
            f'  Platforms: {len(platforms)}, '
            f'Steps: {len(normal_steps)} normal + {len(strict_steps)} strict, '
            f'Feedbacks: {len(feedback_defs)}'
        )

        # ----- Master CVs -----
        base_cv_ids = seed_base_cvs(client)

        # The first application to keep a CV copy is the one the PDF export
        # is exercised against, once everything else has run.
        pdf_application_id: str | None = None

        # company_id_cache maps company name → ID returned from the API
        # so the same company is reused across applications instead of
        # being re-created every time (which would hit the unique index).
        company_id_cache: dict[str, int] = {}

        # ----- Decide which applications get finalized -----
        # Only 7 stay active, the rest are all finalized
        num_active = 7
        num_finalized = NUM_APPLICATIONS - num_active
        finalize_plan: list[dict | None] = []
        # Offers
        for _ in range(MIN_ACCEPTED):
            finalize_plan.append({'feedback': accepted_fb, 'offer': True})
        # Remaining finalized are denied
        for _ in range(num_finalized - MIN_ACCEPTED):
            finalize_plan.append({
                'feedback': random.choice(other_feedbacks),
                'offer': False,
            })
        # 7 active (not finalized)
        for _ in range(num_active):
            finalize_plan.append(None)
        random.shuffle(finalize_plan)

        # ----- Create applications with steps -----
        print(f'Creating {NUM_APPLICATIONS} applications...')
        created = 0
        finalized_count = 0
        accepted_count = 0
        cv_copies = 0
        # Roughly half the applications get a CV copy; the first one that
        # does gets the full create/read/update/delete round trip.
        seed_cv_plan = [i % 2 == 0 for i in range(NUM_APPLICATIONS)]

        for i in range(NUM_APPLICATIONS):
            company_name, company_url = random.choice(COMPANIES)
            # Reuse existing company ID if already created, otherwise
            # send inline object so the API creates it on first use.
            if company_name in company_id_cache:
                company_field: int | dict = company_id_cache[company_name]
            else:
                company_field = {'name': company_name, 'url': company_url}
            role = random.choice(ROLES)
            mode = random.choice(['active', 'active', 'active', 'passive'])
            platform_id = random.choice(platform_ids)
            app_date = random_date(DATE_START, DATE_END - timedelta(days=20))

            # The first application exercises the private platform and
            # company end to end (KODI-031).
            if i == 0:
                platform_id = private_platform_id
                company_field = private_company_id

            currency = random.choice(CURRENCIES)
            exp_levels = [
                'junior',
                'mid_level',
                'senior',
                'staff',
                'lead',
                None,
            ]
            work_modes = ['remote', 'hybrid', 'on_site', None]

            salary_min = random.choice([None, 3000, 5000, 8000, 10000, 15000])
            salary_max = (
                salary_min + random.randint(2000, 8000) if salary_min else None
            )

            payload = {
                'company': company_field,
                'role': role,
                'mode': mode,
                'platform_id': platform_id,
                'application_date': app_date.isoformat(),
                'observation': random.choice(OBSERVATIONS),
                'expected_salary': (
                    random.choice([None, 5000, 8000, 12000, 18000, 25000])
                ),
                'salary_range_min': salary_min,
                'salary_range_max': salary_max,
                'currency': currency,
                'salary_period': (
                    random.choice(['monthly', 'annually']) if currency else None
                ),
                'experience_level': random.choice(exp_levels),
                'work_mode': random.choice(work_modes),
                'country': random.choice(COUNTRIES),
                'job_description': random.choice(JOB_DESCRIPTIONS),
            }

            resp = client.post('/applications', json=payload)
            if resp.status_code != 201:
                print(
                    f'  [{i + 1}] Failed to create application: '
                    f'{resp.status_code} {resp.text}'
                )
                continue

            app = resp.json()
            app_id = app['id']
            created += 1
            if company_name not in company_id_cache and app.get('company_id'):
                company_id_cache[company_name] = app['company_id']

            # ----- CV copy -----
            # Before the steps and the finalize: writing to the copy of a
            # finalized application is refused, by design.
            if seed_cv_plan[i] and seed_application_cv(
                client, app_id, base_cv_ids, full_cycle=(cv_copies == 0)
            ):
                cv_copies += 1
                if pdf_application_id is None:
                    pdf_application_id = app_id

            # ----- Timeline (web) or steps (0.1.4), 3-5 entries -----
            plan = finalize_plan[i]
            first_date = app_date + timedelta(days=random.randint(1, 5))
            if i % 2 == 0:
                closed = seed_timeline(client, app_id, first_date, plan)
            else:
                closed = seed_legacy_steps(
                    client,
                    app_id,
                    first_date,
                    plan,
                    normal_steps,
                    offer_step,
                    denied_step,
                )
            if closed:
                finalized_count += 1
                if plan and plan['offer']:
                    accepted_count += 1

            status = 'finalized' if plan else 'in progress'
            print(
                f'  [{i + 1}/{NUM_APPLICATIONS}] {company_name} — '
                f'{role} ({status})'
            )

        print('\n--- Summary ---')
        print(f'Applications created: {created}')
        print(f'Finalized: {finalized_count}')
        print(f'Offers: {accepted_count}')
        print(f'In progress: {created - finalized_count}')
        print(f'Master CVs created: {len(base_cv_ids)}')
        print(f'Application CV copies created: {cv_copies}')

        seed_cv_pdfs(
            client,
            base_cv_ids[0] if base_cv_ids else None,
            pdf_application_id,
        )


if __name__ == '__main__':
    main()
