//! Typed, content-free startup causes. Never format the vendor error: it may
//! contain local paths or arbitrary setup/plugin text.
use std::{io, path::{Path, PathBuf}};

pub fn classify(error: &tauri::Error) -> &'static str {
    match error {
        tauri::Error::Runtime(error) => match error {
            tauri_runtime::Error::WebviewRuntimeNotInstalled => "STANDALONE_WEBVIEW_UNAVAILABLE",
            tauri_runtime::Error::CreateWebview(_) => "STANDALONE_WEBVIEW_CREATE_FAILED",
            tauri_runtime::Error::CreateWindow => "STANDALONE_WINDOW_CREATE_FAILED",
            _ => "STANDALONE_DESKTOP_RUNTIME_FAILED",
        },
        tauri::Error::AssetNotFound(_) | tauri::Error::InvalidIcon(_) => "STANDALONE_DESKTOP_RESOURCE_FAILED",
        tauri::Error::Io(error) | tauri::Error::CurrentDir(error) => match error.kind() {
            io::ErrorKind::PermissionDenied => "STANDALONE_DESKTOP_ACCESS_DENIED",
            _ => "STANDALONE_DESKTOP_IO_FAILED",
        },
        tauri::Error::Setup(_) | tauri::Error::PluginInitialization(_, _) => "STANDALONE_DESKTOP_SETUP_FAILED",
        _ => "STANDALONE_APPLICATION_RUN_FAILED",
    }
}

pub fn report(directory: &Path, code: &str) -> io::Result<PathBuf> {
    let allowed = ["STANDALONE_WEBVIEW_UNAVAILABLE", "STANDALONE_WEBVIEW_CREATE_FAILED",
        "STANDALONE_WINDOW_CREATE_FAILED", "STANDALONE_DESKTOP_RUNTIME_FAILED",
        "STANDALONE_DESKTOP_RESOURCE_FAILED", "STANDALONE_DESKTOP_ACCESS_DENIED",
        "STANDALONE_DESKTOP_IO_FAILED", "STANDALONE_DESKTOP_SETUP_FAILED", "STANDALONE_APPLICATION_RUN_FAILED"];
    if !allowed.contains(&code) { return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid startup code")); }
    std::fs::create_dir_all(directory)?;
    let file = directory.join("DataSecure-Startdiagnose.txt");
    std::fs::write(&file, format!("DataSecure konnte seine Oberfläche nicht starten.\nFehlercode: {code}\n\nDies ist ein System-/Paketfehler, kein Fehler Ihrer Dokumente.\nBitte das vollständige Paket für Ihr Betriebssystem und Ihre Architektur verwenden.\nMit der IT Webview-Laufzeit, Ausführungsrechte und Sicherheitsrichtlinien prüfen. Schutzfunktionen nicht deaktivieren.\n\nDieser Ordner enthält inhaltsfreie Diagnoseprotokolle.\nAuch ohne Oberfläche: DataSecure mit --startup-diagnostics starten, um den Diagnoseordner zu öffnen.\n"))?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn vendor_text_and_local_paths_never_enter_the_classification() {
        let error = tauri::Error::Io(io::Error::new(io::ErrorKind::PermissionDenied, "PRIVATE NAME /secret/source.pdf"));
        assert_eq!(classify(&error), "STANDALONE_DESKTOP_ACCESS_DENIED");
        let error = tauri::Error::AssetNotFound("PRIVATE NAME".into());
        assert_eq!(classify(&error), "STANDALONE_DESKTOP_RESOURCE_FAILED");
        assert_eq!(classify(&tauri::Error::Runtime(tauri_runtime::Error::WebviewRuntimeNotInstalled)), "STANDALONE_WEBVIEW_UNAVAILABLE");
    }
    #[test]
    fn reports_reject_arbitrary_error_strings() {
        assert!(report(Path::new("."), "private/source.pdf").is_err());
    }
    #[test]
    fn report_is_readable_without_webview_and_disk_failures_are_not_success() {
        let suffix = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let directory = std::env::temp_dir().join(format!("datasecure-startdiag-{}-{suffix}", std::process::id()));
        let file = report(&directory, "STANDALONE_WEBVIEW_UNAVAILABLE").unwrap();
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(text.contains("--startup-diagnostics"));
        assert!(text.contains("kein Fehler Ihrer Dokumente"));
        assert!(!text.contains(&directory.to_string_lossy().to_string()));
        assert!(report(&file, "STANDALONE_WEBVIEW_UNAVAILABLE").is_err());
        std::fs::remove_file(file).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
}
