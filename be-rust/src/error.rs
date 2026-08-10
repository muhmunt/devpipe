use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::domain::DomainError;

pub enum AppError {
    NotFound,
    Conflict(String),
    Invalid(String),
    Internal(String),
    NotImplemented,
}

impl From<DomainError> for AppError {
    fn from(err: DomainError) -> Self {
        match err {
            DomainError::NotFound => AppError::NotFound,
            DomainError::Conflict(msg) => AppError::Conflict(msg),
            DomainError::Invalid(msg) => AppError::Invalid(msg),
            DomainError::Io(e) => AppError::Internal(e.to_string()),
            DomainError::Db(e) => AppError::Internal(e.to_string()),
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound,
            other => AppError::Internal(other.to_string()),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "not found".to_string()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg),
            AppError::Invalid(msg) => (StatusCode::UNPROCESSABLE_ENTITY, msg),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
            AppError::NotImplemented => (StatusCode::NOT_IMPLEMENTED, "not implemented".to_string()),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
