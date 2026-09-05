//! An opt-in profile for the native package smoke, not a user configuration.
//! Validate before logging, creating a WebView or starting the real sidecar.
use std::{
    ffi::OsString,
    path::{Component, Path, PathBuf},
};

pub const PROFILE_ENV: &str = "DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT";
const ERROR: &str = "STANDALONE_NATIVE_SMOKE_PROFILE_INVALID";

#[derive(Debug)]
pub struct Profile {
    pub documents: PathBuf,
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
    for (key, relative) in [
        ("USERPROFILE", "profile"),
        ("HOME", "profile"),
        ("LOCALAPPDATA", "profile/Local"),
        ("APPDATA", "profile/Roaming"),
        ("XDG_DATA_HOME", "profile/Xdg"),
        ("TEMP", "temp"),
        ("TMP", "temp"),
        ("TMPDIR", "temp"),
        ("DATASECURE_STANDALONE_DOCUMENTS_DIR", "profile/Documents"),
        ("WEBVIEW2_USER_DATA_FOLDER", "webview"),
    ] {
        let expected = root.join(relative);
        let actual = environment(key).map(PathBuf::from).ok_or(ERROR)?;
        if actual != expected {
            return Err(ERROR.into());
        }
        regular_path(&actual, true)?;
    }
    Ok(Profile {
        documents: root.join("profile/Documents"),
        webview: root.join("webview"),
    })
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
        let mut variables = HashMap::new();
        for (key, relative) in [
            ("USERPROFILE", "profile"),
            ("HOME", "profile"),
            ("LOCALAPPDATA", "profile/Local"),
            ("APPDATA", "profile/Roaming"),
            ("XDG_DATA_HOME", "profile/Xdg"),
            ("TEMP", "temp"),
            ("TMP", "temp"),
            ("TMPDIR", "temp"),
            ("DATASECURE_STANDALONE_DOCUMENTS_DIR", "profile/Documents"),
            ("WEBVIEW2_USER_DATA_FOLDER", "webview"),
        ] {
            let value = root.join(relative);
            std::fs::create_dir_all(&value).unwrap();
            variables.insert(key, value.into_os_string());
        }
        let profile = validate(&root, &exe, |key| variables.get(key).cloned()).unwrap();
        assert_eq!(profile.documents, root.join("profile/Documents"));
        assert_eq!(profile.webview, root.join("webview"));
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
        for key in variables.keys() {
            assert!(validate(&root, &exe, |candidate| if candidate == *key {
                None
            } else {
                variables.get(candidate).cloned()
            })
            .is_err());
            assert!(validate(&root, &exe, |candidate| if candidate == *key {
                Some(root.parent().unwrap().as_os_str().to_owned())
            } else {
                variables.get(candidate).cloned()
            })
            .is_err());
        }
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
            "temp",
            "webview",
        ] {
            std::fs::remove_dir(root.join(relative)).unwrap();
        }
        std::fs::remove_dir(root).unwrap();
    }
}
