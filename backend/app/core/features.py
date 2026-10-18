"""Beta features (ADR-0018, KODI-052): the keys, the stages and the access
rule.

A user has feature F when F is ``general``, or when a ``(F, user)`` beta-list
row exists, or when the user is an admin with no ``(F, user)`` opt-out row.
Nothing else grants F; a key with no ``features`` row is hidden from
everyone, admins included. ``access_via`` is that rule as a pure function;
``FeatureRepository`` runs the same predicate as one SQL query.
"""

from enum import StrEnum

# The body Starlette answers for a route that does not exist; a gated route
# answers it too, so a missing feature looks exactly like a missing route.
NOT_FOUND_DETAIL = 'Not Found'


class FeatureKey(StrEnum):
    """Every feature the code gates. A new member needs its own Release A
    seed row (ADR-0018); until that row exists the feature is hidden."""

    JOBS = 'jobs'
    # Master CVs, CV copies on applications and drafts (ADR-0021: gated
    # after it shipped; its Release A migration listed the CV owners).
    CVS = 'cvs'


class FeatureStage(StrEnum):
    BETA = 'beta'
    GENERAL = 'general'


class AccessVia(StrEnum):
    """Why a user has a feature, first match wins."""

    GENERAL = 'general'
    LIST = 'list'
    ADMIN = 'admin'


def access_via(
    stage: FeatureStage | str,
    listed: bool,
    is_admin: bool,
    opted_out: bool,
) -> AccessVia | None:
    """Why the user has the feature, or ``None`` when they do not.

    ``general`` beats everything (an opt-out counts only in ``beta``); a
    beta-list row beats an opt-out (the opt-out removes only the admin
    access); an admin without an opt-out has it; nobody else does. An
    opt-out row left by a former admin grants nothing.
    """
    if stage == FeatureStage.GENERAL:
        return AccessVia.GENERAL
    if listed:
        return AccessVia.LIST
    if is_admin and not opted_out:
        return AccessVia.ADMIN
    return None
