use serde::Serialize;

use crate::core::tool_adapters;

#[derive(Debug, Serialize)]
pub struct ToolInfoDto {
    pub key: String,
    pub display_name: String,
    pub installed: bool,
    pub skills_dir: String,
}

#[tauri::command]
pub async fn get_tool_status() -> Result<Vec<ToolInfoDto>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let adapters = tool_adapters::default_tool_adapters();
        let result: Vec<ToolInfoDto> = adapters
            .into_iter()
            .map(|a| ToolInfoDto {
                key: a.key.clone(),
                display_name: a.display_name.clone(),
                installed: a.is_installed(),
                skills_dir: a.skills_dir().to_string_lossy().to_string(),
            })
            .collect();
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
