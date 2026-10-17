//! The package builders compare this compile-time identity with fresh sources.
//! Reading every byte preserves the whole marker through LTO and dead stripping;
//! code signing may append/replace signatures without changing this data.
#[used]
static BUILD_SOURCE_MARKER: &str = concat!(
    "DATASECURE_STANDALONE_SOURCE_SHA256_V1:",
    env!("DATASECURE_SOURCE_FINGERPRINT"),
    ":END_DATASECURE_SOURCE_SHA256"
);

pub(crate) fn retain() {
    for byte in BUILD_SOURCE_MARKER.as_bytes() {
        // Each pointer refers to an initialized byte of this static string.
        // Volatile reads prevent the linker/optimizer from trimming the marker.
        std::hint::black_box(unsafe { std::ptr::read_volatile(byte) });
    }
}
