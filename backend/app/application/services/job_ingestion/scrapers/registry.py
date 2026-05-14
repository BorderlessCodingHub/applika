from app.application.services.job_ingestion.scrapers.himalayas import (
    HimalayasScraper,
)
from app.application.services.job_ingestion.scrapers.remoteok import (
    RemoteOKScraper,
)

SCRAPERS: dict[str, object] = {
    'himalayas': HimalayasScraper(),
    'remoteok': RemoteOKScraper(),
}
