use anyhow::{anyhow, Result};
use std::{env, fs, path::PathBuf};

pub fn portable_data_dir() -> Result<PathBuf> {
    if let Ok(value) = env::var("PACT_PORTABLE_DIR") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            fs::create_dir_all(&path)?;
            return Ok(path);
        }
    }

    if let Ok(executable) = env::current_exe() {
        if let Some(parent) = executable.parent() {
            let candidate = parent.join("portable-data");
            if fs::create_dir_all(&candidate).is_ok() {
                return Ok(candidate);
            }
        }
    }

    let project_dirs = directories::ProjectDirs::from("com", "pact", "flutter-client")
        .ok_or_else(|| anyhow!("cannot resolve application support directory"))?;
    let fallback = project_dirs.config_dir().join("portable-data");
    fs::create_dir_all(&fallback)?;
    Ok(fallback)
}
