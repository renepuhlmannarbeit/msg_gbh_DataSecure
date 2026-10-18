//! The package builders compare this compile-time identity with fresh sources.
//! Reading every byte preserves the whole marker through LTO and dead stripping;
//! code signing may append/replace signatures without changing this data.
#[used]
static BUILD_SOURCE_MARKER: &str = concat!(
    "DATASECURE_STANDALONE_SOURCE_SHA256_V1:",
    env!("DATASECURE_SOURCE_FINGERPRINT"),
    ":END_DATASECURE_SOURCE_SHA256"
);

#[cfg(not(target_os = "macos"))]
#[used]
static OWNERSHIP_GUARD_MARKER: &str = concat!(
    "DATASECURE_OWNERSHIP_GUARD_SHA256_V1:",
    env!("DATASECURE_OWNERSHIP_GUARD_SHA256"),
    ":END_DATASECURE_OWNERSHIP_GUARD"
);

#[cfg(not(target_os = "macos"))]
pub(crate) fn ownership_guard_sha256() -> &'static str {
    env!("DATASECURE_OWNERSHIP_GUARD_SHA256")
}

#[cfg(target_os = "macos")]
#[used]
static MACOS_STATIC_CORE_MARKER: &str = concat!("DATASECURE_MACOS_STATIC_CORE_SHA256_V1:",
    env!("DATASECURE_MACOS_STATIC_CORE_SHA256"), ":END_DATASECURE_MACOS_STATIC_CORE_SHA256");
#[cfg(target_os = "macos")]
#[used]
static MACOS_STATIC_CORE_ARTIFACT_MARKER: &str = concat!("DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256_V1:",
    env!("DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256"), ":END_DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256");
#[cfg(target_os = "macos")]
pub(crate) fn macos_static_core_sha256() -> &'static str { env!("DATASECURE_MACOS_STATIC_CORE_SHA256") }
#[cfg(target_os = "macos")]
pub(crate) fn macos_static_core_artifact_sha256() -> &'static str { env!("DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256") }

/// Published builds may provide a Git identity. Local engineering packages
/// instead use the equally precise prefix of their embedded source identity;
/// never emit "unidentified" when Cargo already required the source marker.
/// This remains a build identifier, not a promise that it is a Git commit.
pub(crate) fn diagnostic_build_id(preferred: Option<&'static str>) -> &'static str {
    if let Some(value) = preferred {
        if value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()) {
            return value;
        }
    }
    // build.rs validates the entire 64-character lower-case SHA256 before
    // exposing this compile-time value. No runtime environment is consulted.
    &env!("DATASECURE_SOURCE_FINGERPRINT")[..40]
}

pub(crate) fn retain() {
    let mut marker_bytes = Vec::from(BUILD_SOURCE_MARKER.as_bytes());
    #[cfg(not(target_os = "macos"))]
    marker_bytes.extend_from_slice(OWNERSHIP_GUARD_MARKER.as_bytes());
    #[cfg(target_os = "macos")]
    { marker_bytes.extend_from_slice(MACOS_STATIC_CORE_MARKER.as_bytes());
      marker_bytes.extend_from_slice(MACOS_STATIC_CORE_ARTIFACT_MARKER.as_bytes()); }
    for byte in marker_bytes.iter() {
        // Each pointer refers to an initialized byte of this static string.
        // Volatile reads prevent the linker/optimizer from trimming the marker.
        std::hint::black_box(unsafe { std::ptr::read_volatile(byte) });
    }
}

#[cfg(test)]
mod tests {
    use super::diagnostic_build_id;

    #[test]
    fn missing_build_id_uses_actual_embedded_source() {
        assert_eq!(diagnostic_build_id(None), &env!("DATASECURE_SOURCE_FINGERPRINT")[..40]);
        assert_ne!(diagnostic_build_id(None), "unidentified");
    }

    #[test]
    fn explicit_valid_build_id_is_preserved() {
        let value = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(diagnostic_build_id(Some(value)), value);
    }

    #[test]
    fn malformed_or_private_build_values_never_enter_diagnostics() {
        for value in ["", "short", "A000000000000000000000000000000000000000",
            "g000000000000000000000000000000000000000", "C:\\Users\\private-user\\build"] {
            assert_eq!(diagnostic_build_id(Some(value)), diagnostic_build_id(None));
        }
    }
}
