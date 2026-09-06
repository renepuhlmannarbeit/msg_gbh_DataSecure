//! An opt-in profile for the native package smoke, not a user configuration.
//! Validate before logging, creating a WebView or starting the real sidecar.
use std::{
    ffi::OsString,
    io::Write,
    path::{Component, Path, PathBuf},
};

pub const PROFILE_ENV: &str = "DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT";
const ERROR: &str = "STANDALONE_NATIVE_SMOKE_PROFILE_INVALID";

#[derive(Debug)]
pub struct Profile {
    pub user_profile: PathBuf,
    pub local_app_data: PathBuf,
    pub roaming_app_data: PathBuf,
    pub xdg_data: PathBuf,
    pub temp: PathBuf,
    pub documents: PathBuf,
    pub diagnostics: PathBuf,
    pub webview: PathBuf,
}

fn is_reserved_root(path: &Path) -> bool {
    const PREFIX: &str = ".tmp-standalone-native-";
    path.file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| {
            name.get(..PREFIX.len())
                .filter(|prefix| prefix.eq_ignore_ascii_case(PREFIX))
                .and_then(|_| name.get(PREFIX.len()..))
        })
        .is_some_and(|suffix| {
            suffix.len() == 32 && suffix.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
}

fn regular_path(path: &Path, directory: bool) -> Result<(), String> {
    if !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
    {
        return Err(ERROR.into());
    }
    for ancestor in path.ancestors() {
        let metadata = std::fs::symlink_metadata(ancestor).map_err(|_| ERROR.to_string())?;
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(ERROR.into());
            }
        }
        if metadata.file_type().is_symlink() {
            return Err(ERROR.into());
        }
        if ancestor == path {
            if directory != metadata.is_dir() || (!directory && !metadata.is_file()) {
                return Err(ERROR.into());
            }
        } else if !metadata.is_dir() {
            return Err(ERROR.into());
        }
    }
    Ok(())
}

pub fn validate(
    root: &Path,
    executable: &Path,
    environment: impl Fn(&str) -> Option<OsString>,
) -> Result<Profile, String> {
    if !is_reserved_root(root) {
        return Err(ERROR.into());
    }
    regular_path(root, true)?;
    regular_path(executable, false)?;
    let product = executable.parent().ok_or(ERROR)?;
    if product.parent() != Some(root.join("candidate").as_path())
        || !product
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .starts_with("DataSecure-Standalone-")
        || executable.file_name().and_then(|name| name.to_str())
            != Some("DataSecure Standalone.exe")
    {
        return Err(ERROR.into());
    }
    for relative in [
        "profile",
        "profile/Local",
        "profile/Roaming",
        "profile/Xdg",
        "profile/Documents",
        "temp",
        "temp/SecureDataMsg-Standalone",
        "webview/main",
    ] {
        regular_path(&root.join(relative), true)?;
    }
    let webview = root.join("webview/main");
    regular_path(&webview, true)?;
    // Native smoke uses the same automatic Tauri window creation as the
    // product. Its test-only WebView2 override is the single UDF authority.
    if environment("WEBVIEW2_USER_DATA_FOLDER").map(PathBuf::from) != Some(webview.clone()) {
        return Err(ERROR.into());
    }
    Ok(Profile {
        user_profile: root.join("profile"),
        local_app_data: root.join("profile/Local"),
        roaming_app_data: root.join("profile/Roaming"),
        xdg_data: root.join("profile/Xdg"),
        temp: root.join("temp"),
        documents: root.join("profile/Documents"),
        diagnostics: root.join("temp/SecureDataMsg-Standalone"),
        webview,
    })
}

pub fn prepare_webview_directory(profile: &Profile) -> Result<PathBuf, String> {
    regular_path(&profile.webview, true)?;
    let probe = profile.webview.join(".datasecure-write-probe");
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(|_| ERROR.to_string())?;
    file.write_all(b"probe").map_err(|_| ERROR.to_string())?;
    file.sync_all().map_err(|_| ERROR.to_string())?;
    drop(file);
    std::fs::remove_file(&probe).map_err(|_| ERROR.to_string())?;
    Ok(profile.webview.clone())
}

fn select_profile(
    executable: &Path,
    windows: bool,
    environment: impl Fn(&str) -> Option<OsString>,
) -> Result<Option<Profile>, String> {
    let Some(root) = environment(PROFILE_ENV) else {
        // A copied smoke binary must never silently use product storage merely
        // because its launcher forgot the opt-in variable.
        if executable.ancestors().any(is_reserved_root) {
            return Err(ERROR.into());
        }
        return Ok(None);
    };
    // This harness has only Windows native evidence. Other targets keep their
    // normal product paths; they cannot silently treat this as validated smoke.
    if !windows {
        return Err(ERROR.into());
    }
    validate(&PathBuf::from(root), executable, environment).map(Some)
}

pub fn from_environment() -> Result<Option<Profile>, String> {
    let executable = std::env::current_exe().map_err(|_| ERROR.to_string())?;
    select_profile(&executable, cfg!(target_os = "windows"), |key| {
        std::env::var_os(key)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        collections::HashMap,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn missing_marker_is_normal_only_outside_the_reserved_smoke_directory() {
        let base = std::env::temp_dir();
        let normal = base.join("DataSecure-Standalone-normal/DataSecure Standalone.exe");
        let copied = base.join(".tmp-standalone-native-0123456789abcdef0123456789abcdef/candidate/DataSecure-Standalone-test-windows-x64/DataSecure Standalone.exe");
        assert!(select_profile(&normal, true, |_| None).unwrap().is_none());
        assert!(select_profile(&normal, false, |_| None).unwrap().is_none());
        assert_eq!(select_profile(&copied, true, |_| None).unwrap_err(), ERROR);
        assert_eq!(select_profile(&copied, false, |_| None).unwrap_err(), ERROR);
        let case_variant = base.join(".TMP-STANDALONE-NATIVE-0123456789ABCDEF0123456789ABCDEF/candidate/DataSecure-Standalone-test-windows-x64/DataSecure Standalone.exe");
        assert_eq!(
            select_profile(&case_variant, true, |_| None).unwrap_err(),
            ERROR
        );
    }

    #[test]
    fn smoke_profile_binds_every_mutable_namespace_and_the_copied_executable() {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(".tmp-standalone-native-{id:032x}"));
        std::fs::create_dir(&root).unwrap();
        let exe =
            root.join("candidate/DataSecure-Standalone-test-windows-x64/DataSecure Standalone.exe");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        std::fs::write(&exe, b"synthetic executable identity only").unwrap();
        for relative in [
            "profile/Local",
            "profile/Roaming",
            "profile/Xdg",
            "profile/Documents",
            "temp/SecureDataMsg-Standalone",
        ] {
            std::fs::create_dir_all(root.join(relative)).unwrap();
        }
        std::fs::create_dir_all(root.join("webview/main")).unwrap();
        let mut variables = HashMap::new();
        variables.insert(
            "WEBVIEW2_USER_DATA_FOLDER",
            root.join("webview/main").into_os_string(),
        );
        let profile = validate(&root, &exe, |key| variables.get(key).cloned()).unwrap();
        assert_eq!(profile.documents, root.join("profile/Documents"));
        assert_eq!(profile.local_app_data, root.join("profile/Local"));
        assert_eq!(
            profile.diagnostics,
            root.join("temp/SecureDataMsg-Standalone")
        );
        assert_eq!(profile.webview, root.join("webview/main"));
        let selected = select_profile(&exe, true, |key| {
            if key == PROFILE_ENV {
                Some(root.as_os_str().to_owned())
            } else {
                variables.get(key).cloned()
            }
        })
        .unwrap()
        .unwrap();
        assert_eq!(selected.documents, profile.documents);
        assert_eq!(selected.webview, profile.webview);
        assert_eq!(
            prepare_webview_directory(&profile).unwrap(),
            profile.webview
        );
        assert!(!profile.webview.join(".datasecure-write-probe").exists());
        assert!(validate(&root, &exe, |_| None).is_err());
        variables.insert(
            "WEBVIEW2_USER_DATA_FOLDER",
            root.join("webview").into_os_string(),
        );
        assert!(validate(&root, &exe, |key| variables.get(key).cloned()).is_err());
        variables.insert(
            "WEBVIEW2_USER_DATA_FOLDER",
            root.join("webview/main").into_os_string(),
        );
        assert!(validate(root.parent().unwrap(), &exe, |key| variables
            .get(key)
            .cloned())
        .is_err());
        assert!(
            validate(&root, &std::env::current_exe().unwrap(), |key| variables
                .get(key)
                .cloned())
            .is_err()
        );
        // Delete only enumerated owned paths, never traverse an injected link.
        std::fs::remove_file(&exe).unwrap();
        for relative in [
            "candidate/DataSecure-Standalone-test-windows-x64",
            "candidate",
            "profile/Local",
            "profile/Roaming",
            "profile/Xdg",
            "profile/Documents",
            "profile",
            "temp/SecureDataMsg-Standalone",
            "temp",
            "webview/main",
            "webview",
        ] {
            std::fs::remove_dir(root.join(relative)).unwrap();
        }
        std::fs::remove_dir(root).unwrap();
    }
}
