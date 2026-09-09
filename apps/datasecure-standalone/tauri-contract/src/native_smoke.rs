//! An opt-in profile for the native package smoke, not a user configuration.
//! Validate before logging, creating a WebView or starting the real sidecar.
use std::{
    ffi::OsString,
    io::Write,
    path::{Component, Path, PathBuf},
};

pub const PROFILE_ENV: &str = "DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT";
const ERROR: &str = "STANDALONE_NATIVE_SMOKE_PROFILE_INVALID";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PackageLayout {
    Windows,
    Macos,
    Linux,
}

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

fn validate(
    root: &Path,
    executable: &Path,
    layout: PackageLayout,
    environment: impl Fn(&str) -> Option<OsString>,
) -> Result<Profile, String> {
    if !is_reserved_root(root) {
        return Err(ERROR.into());
    }
    regular_path(root, true)?;
    regular_path(executable, false)?;
    let candidate = root.join("candidate");
    let product = match layout {
        PackageLayout::Windows => executable.parent().ok_or(ERROR)?,
        PackageLayout::Macos | PackageLayout::Linux => executable
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .and_then(Path::parent)
            .ok_or(ERROR)?,
    };
    let executable_matches = match layout {
        PackageLayout::Windows => {
            executable.file_name().and_then(|name| name.to_str())
                == Some("DataSecure Standalone.exe")
        }
        PackageLayout::Macos => {
            executable.file_name().and_then(|name| name.to_str()) == Some("datasecure-standalone")
                && executable
                    .parent()
                    .and_then(Path::parent)
                    .and_then(Path::file_name)
                    .and_then(|name| name.to_str())
                    == Some("Contents")
                && executable
                    .parent()
                    .and_then(Path::parent)
                    .and_then(Path::parent)
                    .and_then(Path::file_name)
                    .and_then(|name| name.to_str())
                    == Some("DataSecure Standalone.app")
        }
        PackageLayout::Linux => {
            executable.file_name().and_then(|name| name.to_str()) == Some("datasecure-standalone")
                && executable
                    .parent()
                    .and_then(Path::file_name)
                    .and_then(|name| name.to_str())
                    == Some("bin")
                && executable
                    .parent()
                    .and_then(Path::parent)
                    .and_then(Path::file_name)
                    .and_then(|name| name.to_str())
                    == Some("usr")
                && executable
                    .parent()
                    .and_then(Path::parent)
                    .and_then(Path::parent)
                    .and_then(Path::file_name)
                    .and_then(|name| name.to_str())
                    == Some("AppDir")
        }
    };
    if product.parent() != Some(candidate.as_path())
        || !product
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .starts_with("DataSecure-Standalone-")
        || !executable_matches
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
    match layout {
        PackageLayout::Windows => {
            // Native smoke uses the same automatic Tauri window creation as
            // the product. Its test-only WebView2 override is the single UDF
            // authority.
            if environment("WEBVIEW2_USER_DATA_FOLDER").map(PathBuf::from) != Some(webview.clone())
            {
                return Err(ERROR.into());
            }
        }
        PackageLayout::Macos => {
            // Keep all product-controlled storage and temporary output inside
            // the owned profile. Cocoa/WebKit system caches on the ephemeral
            // target host are outside the product contract and are not claimed
            // as isolated evidence.
            for (key, expected) in [
                ("HOME", root.join("profile")),
                ("XDG_DATA_HOME", root.join("profile/Xdg")),
                ("TMPDIR", root.join("temp")),
                (
                    "DATASECURE_STANDALONE_DOCUMENTS_DIR",
                    root.join("profile/Documents"),
                ),
            ] {
                if environment(key).map(PathBuf::from) != Some(expected) {
                    return Err(ERROR.into());
                }
            }
        }
        PackageLayout::Linux => {
            let runtime = root.join("profile/Runtime");
            regular_path(&runtime, true)?;
            for (key, expected) in [
                ("HOME", root.join("profile")),
                ("XDG_DATA_HOME", root.join("profile/Xdg")),
                ("XDG_RUNTIME_DIR", runtime),
                ("TMPDIR", root.join("temp")),
                (
                    "DATASECURE_STANDALONE_DOCUMENTS_DIR",
                    root.join("profile/Documents"),
                ),
            ] {
                if environment(key).map(PathBuf::from) != Some(expected) {
                    return Err(ERROR.into());
                }
            }
        }
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
    layout: Option<PackageLayout>,
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
    let layout = layout.ok_or(ERROR)?;
    validate(&PathBuf::from(root), executable, layout, environment).map(Some)
}

pub fn from_environment() -> Result<Option<Profile>, String> {
    let executable = std::env::current_exe().map_err(|_| ERROR.to_string())?;
    let layout = if cfg!(target_os = "windows") {
        Some(PackageLayout::Windows)
    } else if cfg!(target_os = "macos") {
        Some(PackageLayout::Macos)
    } else if cfg!(target_os = "linux") {
        Some(PackageLayout::Linux)
    } else {
        None
    };
    select_profile(&executable, layout, |key| std::env::var_os(key))
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
        assert!(
            select_profile(&normal, Some(PackageLayout::Windows), |_| None)
                .unwrap()
                .is_none()
        );
        assert!(
            select_profile(&normal, Some(PackageLayout::Macos), |_| None)
                .unwrap()
                .is_none()
        );
        assert!(
            select_profile(&normal, Some(PackageLayout::Linux), |_| None)
                .unwrap()
                .is_none()
        );
        assert_eq!(
            select_profile(&copied, Some(PackageLayout::Windows), |_| None).unwrap_err(),
            ERROR
        );
        assert_eq!(select_profile(&copied, None, |_| None).unwrap_err(), ERROR);
        let case_variant = base.join(".TMP-STANDALONE-NATIVE-0123456789ABCDEF0123456789ABCDEF/candidate/DataSecure-Standalone-test-windows-x64/DataSecure Standalone.exe");
        assert_eq!(
            select_profile(&case_variant, Some(PackageLayout::Windows), |_| None).unwrap_err(),
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
        // macOS commonly exposes its temporary directory through `/var`, while
        // the real filesystem location is `/private/var`. The production
        // validator correctly rejects symlinked ancestors, so exercise it with
        // the canonical identity of the directory we just created.
        let root = std::fs::canonicalize(root).unwrap();
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
        let profile = validate(&root, &exe, PackageLayout::Windows, |key| {
            variables.get(key).cloned()
        })
        .unwrap();
        assert_eq!(profile.documents, root.join("profile/Documents"));
        assert_eq!(profile.local_app_data, root.join("profile/Local"));
        assert_eq!(
            profile.diagnostics,
            root.join("temp/SecureDataMsg-Standalone")
        );
        assert_eq!(profile.webview, root.join("webview/main"));
        let selected = select_profile(&exe, Some(PackageLayout::Windows), |key| {
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
        assert!(validate(&root, &exe, PackageLayout::Windows, |_| None).is_err());
        variables.insert(
            "WEBVIEW2_USER_DATA_FOLDER",
            root.join("webview").into_os_string(),
        );
        assert!(
            validate(&root, &exe, PackageLayout::Windows, |key| variables
                .get(key)
                .cloned())
            .is_err()
        );
        variables.insert(
            "WEBVIEW2_USER_DATA_FOLDER",
            root.join("webview/main").into_os_string(),
        );
        assert!(validate(
            root.parent().unwrap(),
            &exe,
            PackageLayout::Windows,
            |key| variables.get(key).cloned()
        )
        .is_err());
        assert!(validate(
            &root,
            &std::env::current_exe().unwrap(),
            PackageLayout::Windows,
            |key| variables.get(key).cloned()
        )
        .is_err());
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

    #[test]
    fn macos_smoke_accepts_only_the_exact_app_bundle_layout_and_owned_paths() {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(".tmp-standalone-native-{id:032x}"));
        std::fs::create_dir(&root).unwrap();
        let root = std::fs::canonicalize(root).unwrap();
        let executable = root.join(
            "candidate/DataSecure-Standalone-test-macos-arm64/DataSecure Standalone.app/Contents/MacOS/datasecure-standalone",
        );
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::write(&executable, b"synthetic executable identity only").unwrap();
        for relative in [
            "profile/Local",
            "profile/Roaming",
            "profile/Xdg",
            "profile/Documents",
            "temp/SecureDataMsg-Standalone",
            "webview/main",
        ] {
            std::fs::create_dir_all(root.join(relative)).unwrap();
        }
        let variables = HashMap::from([
            ("HOME", root.join("profile").into_os_string()),
            ("XDG_DATA_HOME", root.join("profile/Xdg").into_os_string()),
            ("TMPDIR", root.join("temp").into_os_string()),
            (
                "DATASECURE_STANDALONE_DOCUMENTS_DIR",
                root.join("profile/Documents").into_os_string(),
            ),
        ]);
        let profile = validate(&root, &executable, PackageLayout::Macos, |key| {
            variables.get(key).cloned()
        })
        .unwrap();
        assert_eq!(profile.documents, root.join("profile/Documents"));
        let selected = select_profile(&executable, Some(PackageLayout::Macos), |key| {
            if key == PROFILE_ENV {
                Some(root.as_os_str().to_owned())
            } else {
                variables.get(key).cloned()
            }
        })
        .unwrap()
        .unwrap();
        assert_eq!(selected.diagnostics, profile.diagnostics);
        let wrong = root.join(
            "candidate/DataSecure-Standalone-test-macos-arm64/DataSecure Standalone.app/Contents/MacOS/not-the-app",
        );
        std::fs::write(&wrong, b"wrong identity").unwrap();
        assert!(
            validate(&root, &wrong, PackageLayout::Macos, |key| variables
                .get(key)
                .cloned())
            .is_err()
        );
        std::fs::remove_file(wrong).unwrap();
        std::fs::remove_file(executable).unwrap();
        for relative in [
            "candidate/DataSecure-Standalone-test-macos-arm64/DataSecure Standalone.app/Contents/MacOS",
            "candidate/DataSecure-Standalone-test-macos-arm64/DataSecure Standalone.app/Contents",
            "candidate/DataSecure-Standalone-test-macos-arm64/DataSecure Standalone.app",
            "candidate/DataSecure-Standalone-test-macos-arm64",
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

    #[test]
    fn linux_smoke_accepts_only_the_exact_appdir_layout_and_owned_paths() {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(".tmp-standalone-native-{id:032x}"));
        std::fs::create_dir(&root).unwrap();
        let root = std::fs::canonicalize(root).unwrap();
        let executable = root.join(
            "candidate/DataSecure-Standalone-test-linux-x64-glibc/AppDir/usr/bin/datasecure-standalone",
        );
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::write(&executable, b"synthetic executable identity only").unwrap();
        for relative in [
            "profile/Local",
            "profile/Roaming",
            "profile/Xdg",
            "profile/Runtime",
            "profile/Documents",
            "temp/SecureDataMsg-Standalone",
            "webview/main",
        ] {
            std::fs::create_dir_all(root.join(relative)).unwrap();
        }
        let variables = HashMap::from([
            ("HOME", root.join("profile").into_os_string()),
            ("XDG_DATA_HOME", root.join("profile/Xdg").into_os_string()),
            (
                "XDG_RUNTIME_DIR",
                root.join("profile/Runtime").into_os_string(),
            ),
            ("TMPDIR", root.join("temp").into_os_string()),
            (
                "DATASECURE_STANDALONE_DOCUMENTS_DIR",
                root.join("profile/Documents").into_os_string(),
            ),
        ]);
        let profile = validate(&root, &executable, PackageLayout::Linux, |key| {
            variables.get(key).cloned()
        })
        .unwrap();
        assert_eq!(profile.xdg_data, root.join("profile/Xdg"));
        let selected = select_profile(&executable, Some(PackageLayout::Linux), |key| {
            if key == PROFILE_ENV {
                Some(root.as_os_str().to_owned())
            } else {
                variables.get(key).cloned()
            }
        })
        .unwrap()
        .unwrap();
        assert_eq!(selected.documents, profile.documents);
        let wrong = root.join(
            "candidate/DataSecure-Standalone-test-linux-x64-glibc/AppDir/usr/bin/not-the-app",
        );
        std::fs::write(&wrong, b"wrong identity").unwrap();
        assert!(
            validate(&root, &wrong, PackageLayout::Linux, |key| variables
                .get(key)
                .cloned())
            .is_err()
        );
        std::fs::remove_file(wrong).unwrap();
        std::fs::remove_file(executable).unwrap();
        for relative in [
            "candidate/DataSecure-Standalone-test-linux-x64-glibc/AppDir/usr/bin",
            "candidate/DataSecure-Standalone-test-linux-x64-glibc/AppDir/usr",
            "candidate/DataSecure-Standalone-test-linux-x64-glibc/AppDir",
            "candidate/DataSecure-Standalone-test-linux-x64-glibc",
            "candidate",
            "profile/Local",
            "profile/Roaming",
            "profile/Xdg",
            "profile/Runtime",
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
