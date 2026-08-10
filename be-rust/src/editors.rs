//! Editor detection (phase-r9.2, spec §25/§38/§58) — which editors are
//! installed determines which "Open in Editor" buttons the frontend can
//! offer; never show a button for an editor that isn't there.

use serde::Serialize;

use crate::agents::detect_executable;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorAvailability {
    pub vscode: bool,
    pub cursor: bool,
    pub zed: bool,
}

pub async fn detect_all() -> EditorAvailability {
    EditorAvailability {
        vscode: detect_executable("code").await,
        cursor: detect_executable("cursor").await,
        zed: detect_executable("zed").await,
    }
}
