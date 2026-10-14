"""Typed application errors.

Every error carries an HTTP status, a stable machine-readable ``error_code``, a
short human ``error_title`` and a detailed ``error_content``. The REST API turns
them into the standard error envelope; the CLIs print them and exit non-zero.
"""

from __future__ import annotations


class AppError(Exception):
    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"
    error_title: str = "Internal server error"
    message: str = "The request could not be completed."

    def __init__(self, content: str, *, status_code: int | None = None, error_code: str | None = None,
                 error_title: str | None = None, message: str | None = None, details: dict | None = None):
        super().__init__(content)
        self.error_content = content
        self.details = details   # optional machine-readable extras, returned as "data" in the error envelope
        if status_code is not None:
            self.status_code = status_code
        if error_code is not None:
            self.error_code = error_code
        if error_title is not None:
            self.error_title = error_title
        if message is not None:
            self.message = message


class InputValidationError(AppError):
    status_code = 400
    error_code = "INVALID_INPUT"
    error_title = "Invalid input"
    message = "One or more request parameters are invalid."


class ResourceNotFoundError(AppError):
    status_code = 404
    error_code = "RESOURCE_NOT_FOUND"
    error_title = "Resource not found"
    message = "The requested resource does not exist."


class ModelNotFoundError(ResourceNotFoundError):
    error_code = "MODEL_NOT_FOUND"
    error_title = "Model not found"
    message = "No usable model checkpoint was found."


class DatasetError(AppError):
    status_code = 422
    error_code = "DATASET_INVALID"
    error_title = "Dataset invalid"
    message = "The dataset failed validation."


class ConflictError(AppError):
    status_code = 409
    error_code = "CONFLICT"
    error_title = "Conflict"
    message = "The request conflicts with the current state."


class TrainingLockError(ConflictError):
    error_code = "TRAINING_IN_PROGRESS"
    error_title = "Training already running"
    message = "Another training process is already running."


class CameraUnavailableError(AppError):
    status_code = 503
    error_code = "CAMERA_UNAVAILABLE"
    error_title = "Camera unavailable"
    message = "The camera or video source could not be opened."


class DependencyError(AppError):
    status_code = 500
    error_code = "DEPENDENCY_MISSING"
    error_title = "Dependency missing"
    message = "A required Python package is not installed or failed to load."
