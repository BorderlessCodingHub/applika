class UnicornException(Exception):
    message: str

    def __init__(self, message: str):
        self.message = message

    def __str__(self):
        return f'{self.message}'


class ResourceNotFound(UnicornException): ...


class ResourceConflict(UnicornException): ...
