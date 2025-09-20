from fastapi import APIRouter

from app.presentation.dependencies import CurrentUserDp
from app.presentation.schemas.application_step import (
    CreateApplicationStep, UpdateApplicationStep, ApplicationStep)

router = APIRouter(prefix="/applications", tags=["Applications Steps"])


@router.post("/{application_id}/steps", status_code=201,
             response_model=ApplicationStep)
async def add_step(c_user: CurrentUserDp, application_id: int,
                   payload: CreateApplicationStep):
    raise NotImplementedError("Not implemented yet")


@router.put("/{application_id}/steps", response_model=ApplicationStep)
async def update_step(c_user: CurrentUserDp, application_id: int,
                      payload: UpdateApplicationStep):
    raise NotImplementedError("Not implemented yet")


@router.delete("/{application_id}/steps/{step_id}", status_code=204)
async def delete_step(c_user: CurrentUserDp, application_id: int, step_id: int):
    raise NotImplementedError("Not implemented yet")
